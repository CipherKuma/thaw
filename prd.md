# Thaw - Liquid Staking Protocol - Technical Specification
## Claude Code Implementation Guide

**Target:** Casper Network 2.0 Testnet  
**Framework:** Odra (Rust)  
**Track:** Liquid Staking ($2,500)  

---

## 1. What We're Building

A liquid staking protocol where:
1. User deposits CSPR → receives thCSPR (liquid token)
2. Contract delegates CSPR to validators via System Auction
3. Staking rewards auto-compound, increasing thCSPR:CSPR exchange rate
4. User can unstake anytime (14h unbonding) and receive CSPR + rewards

**Core Innovation:** Uses Casper 2.0's "Contract Access to Auction" - smart contracts can directly call the system auction to stake.

---

## 2. MVP Scope (Build This Only)

| Feature | Include | Exclude |
|---------|---------|---------|
| Stake CSPR → thCSPR | ✅ | |
| Unstake thCSPR → withdrawal queue | ✅ | |
| Claim after unbonding | ✅ | |
| Compound rewards | ✅ | |
| thCSPR token (CEP-18) | ✅ | |
| Single validator | ✅ | Multi-validator rotation |
| Admin functions | ✅ | Governance |
| Instant unstake | | ✅ (skip) |
| Validator scoring | | ✅ (skip) |

---

## 3. Smart Contract Architecture

### 3.1 Contract Structure (Odra)

```
src/
├── lib.rs                 # Module exports
├── thcspr_token.rs        # CEP-18 liquid staking token
├── thaw_core.rs            # Main staking logic
├── auction_interface.rs   # System Auction interaction
└── errors.rs              # Error definitions
```

### 3.2 Thaw Core Contract

```rust
// thaw_core.rs
use odra::{
    casper_types::{U512, U256, PublicKey},
    prelude::*,
    Var, Mapping, Address,
};

#[odra::module]
pub struct ThawCore {
    // Token reference
    thcspr_token: Var<Address>,
    
    // Pool state
    total_pooled_cspr: Var<U512>,      // Total CSPR (staked + pending rewards)
    total_thcspr_supply: Var<U512>,    // Total thCSPR minted
    
    // Staking config
    validator_public_key: Var<PublicKey>,  // Single validator for MVP
    
    // Fees (basis points, 10000 = 100%)
    protocol_fee_bps: Var<U256>,       // Fee on rewards (default: 1000 = 10%)
    treasury: Var<Address>,
    
    // Withdrawals
    withdrawal_counter: Var<u64>,
    withdrawals: Mapping<u64, WithdrawalRequest>,
    user_withdrawals: Mapping<Address, Vec<u64>>,
    
    // Admin
    admin: Var<Address>,
    is_paused: Var<bool>,
    
    // Constants
    min_stake: Var<U512>,              // Minimum stake (default: 10 CSPR)
}

#[odra::odra_type]
pub struct WithdrawalRequest {
    pub id: u64,
    pub user: Address,
    pub cspr_amount: U512,
    pub thcspr_burned: U512,
    pub request_timestamp: u64,
    pub claimable_timestamp: u64,      // request + 14 hours
    pub claimed: bool,
}
```

### 3.3 Entry Points

```rust
#[odra::module]
impl ThawCore {
    /// Initialize the contract
    #[odra(init)]
    pub fn init(
        &mut self,
        thcspr_token: Address,
        validator: PublicKey,
        treasury: Address,
        admin: Address,
    ) {
        self.thcspr_token.set(thcspr_token);
        self.validator_public_key.set(validator);
        self.treasury.set(treasury);
        self.admin.set(admin);
        self.protocol_fee_bps.set(U256::from(1000)); // 10%
        self.min_stake.set(U512::from(10_000_000_000u64)); // 10 CSPR
        self.total_pooled_cspr.set(U512::zero());
        self.total_thcspr_supply.set(U512::zero());
        self.is_paused.set(false);
        self.withdrawal_counter.set(0);
    }

    /// Stake CSPR and receive thCSPR
    #[odra(payable)]
    pub fn stake(&mut self) -> U512 {
        self.require_not_paused();
        
        let caller = self.env().caller();
        let cspr_amount = self.env().attached_value();
        
        // Validate minimum
        require!(
            cspr_amount >= self.min_stake.get_or_default(),
            "Below minimum stake"
        );
        
        // Calculate thCSPR to mint
        let thcspr_amount = self.cspr_to_thcspr(cspr_amount);
        
        // Update state BEFORE external calls (CEI pattern)
        let new_total_pooled = self.total_pooled_cspr.get_or_default() + cspr_amount;
        let new_total_supply = self.total_thcspr_supply.get_or_default() + thcspr_amount;
        self.total_pooled_cspr.set(new_total_pooled);
        self.total_thcspr_supply.set(new_total_supply);
        
        // Mint thCSPR to user
        self.mint_thcspr(caller, thcspr_amount);
        
        // Delegate to validator via System Auction
        self.delegate_to_validator(cspr_amount);
        
        // Emit event
        self.env().emit_event(Staked {
            user: caller,
            cspr_amount,
            thcspr_minted: thcspr_amount,
            exchange_rate: self.get_exchange_rate(),
        });
        
        thcspr_amount
    }

    /// Request unstake - burns thCSPR, queues withdrawal
    pub fn unstake(&mut self, thcspr_amount: U512) -> u64 {
        self.require_not_paused();
        
        let caller = self.env().caller();
        
        // Validate balance
        let balance = self.get_thcspr_balance(caller);
        require!(thcspr_amount <= balance, "Insufficient thCSPR");
        require!(thcspr_amount > U512::zero(), "Amount must be > 0");
        
        // Calculate CSPR to return
        let cspr_amount = self.thcspr_to_cspr(thcspr_amount);
        
        // Update state
        let new_total_pooled = self.total_pooled_cspr.get_or_default() - cspr_amount;
        let new_total_supply = self.total_thcspr_supply.get_or_default() - thcspr_amount;
        self.total_pooled_cspr.set(new_total_pooled);
        self.total_thcspr_supply.set(new_total_supply);
        
        // Burn thCSPR
        self.burn_thcspr(caller, thcspr_amount);
        
        // Undelegate from validator
        self.undelegate_from_validator(cspr_amount);
        
        // Create withdrawal request
        let withdrawal_id = self.withdrawal_counter.get_or_default();
        self.withdrawal_counter.set(withdrawal_id + 1);
        
        let now = self.env().get_block_time();
        let claimable = now + (14 * 60 * 60 * 1000); // 14 hours in ms
        
        let request = WithdrawalRequest {
            id: withdrawal_id,
            user: caller,
            cspr_amount,
            thcspr_burned: thcspr_amount,
            request_timestamp: now,
            claimable_timestamp: claimable,
            claimed: false,
        };
        
        self.withdrawals.set(&withdrawal_id, request.clone());
        
        // Track user's withdrawals
        let mut user_ids = self.user_withdrawals.get(&caller).unwrap_or_default();
        user_ids.push(withdrawal_id);
        self.user_withdrawals.set(&caller, user_ids);
        
        // Emit event
        self.env().emit_event(Unstaked {
            user: caller,
            thcspr_burned: thcspr_amount,
            cspr_amount,
            withdrawal_id,
            claimable_timestamp: claimable,
        });
        
        withdrawal_id
    }

    /// Claim CSPR after unbonding period
    pub fn claim(&mut self, withdrawal_id: u64) -> U512 {
        let caller = self.env().caller();
        
        let mut request = self.withdrawals.get(&withdrawal_id)
            .expect("Withdrawal not found");
        
        require!(request.user == caller, "Not your withdrawal");
        require!(!request.claimed, "Already claimed");
        require!(
            self.env().get_block_time() >= request.claimable_timestamp,
            "Still unbonding"
        );
        
        request.claimed = true;
        self.withdrawals.set(&withdrawal_id, request.clone());
        
        // Transfer CSPR to user
        self.env().transfer_tokens(&caller, &request.cspr_amount);
        
        // Emit event
        self.env().emit_event(Claimed {
            user: caller,
            withdrawal_id,
            cspr_amount: request.cspr_amount,
        });
        
        request.cspr_amount
    }

    /// Harvest and compound staking rewards
    pub fn compound(&mut self) -> U512 {
        // Get rewards from System Auction
        let rewards = self.get_pending_rewards();
        
        if rewards == U512::zero() {
            return U512::zero();
        }
        
        // Withdraw rewards
        self.withdraw_rewards();
        
        // Calculate protocol fee
        let fee_bps = self.protocol_fee_bps.get_or_default();
        let protocol_fee = rewards * U512::from(fee_bps.as_u64()) / U512::from(10000u64);
        let rewards_to_pool = rewards - protocol_fee;
        
        // Send fee to treasury
        if protocol_fee > U512::zero() {
            let treasury = self.treasury.get().expect("Treasury not set");
            self.env().transfer_tokens(&treasury, &protocol_fee);
        }
        
        // Add rewards to pool (increases exchange rate)
        let new_total = self.total_pooled_cspr.get_or_default() + rewards_to_pool;
        self.total_pooled_cspr.set(new_total);
        
        // Restake the rewards
        self.delegate_to_validator(rewards_to_pool);
        
        // Emit event
        self.env().emit_event(Compounded {
            rewards_harvested: rewards,
            protocol_fee,
            rewards_to_pool,
            new_exchange_rate: self.get_exchange_rate(),
        });
        
        rewards_to_pool
    }

    // ============ VIEW FUNCTIONS ============

    /// Get current exchange rate (18 decimal precision)
    /// Returns how much CSPR 1 thCSPR is worth
    pub fn get_exchange_rate(&self) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();
        
        if total_supply == U512::zero() {
            // Initial rate: 1 thCSPR = 1 CSPR
            return U512::from(1_000_000_000_000_000_000u128); // 1e18
        }
        
        // rate = total_pooled / total_supply (scaled by 1e18)
        (total_pooled * U512::from(1_000_000_000_000_000_000u128)) / total_supply
    }

    pub fn get_total_pooled(&self) -> U512 {
        self.total_pooled_cspr.get_or_default()
    }

    pub fn get_total_supply(&self) -> U512 {
        self.total_thcspr_supply.get_or_default()
    }

    pub fn get_user_withdrawals(&self, user: Address) -> Vec<WithdrawalRequest> {
        let ids = self.user_withdrawals.get(&user).unwrap_or_default();
        ids.iter()
            .filter_map(|id| self.withdrawals.get(id))
            .collect()
    }

    // ============ INTERNAL FUNCTIONS ============

    /// Convert CSPR amount to thCSPR
    fn cspr_to_thcspr(&self, cspr_amount: U512) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();
        
        if total_supply == U512::zero() || total_pooled == U512::zero() {
            // 1:1 for first deposit
            return cspr_amount;
        }
        
        // thcspr = cspr * total_supply / total_pooled
        (cspr_amount * total_supply) / total_pooled
    }

    /// Convert thCSPR amount to CSPR
    fn thcspr_to_cspr(&self, thcspr_amount: U512) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();
        
        if total_supply == U512::zero() {
            return U512::zero();
        }
        
        // cspr = thcspr * total_pooled / total_supply
        (thcspr_amount * total_pooled) / total_supply
    }

    fn require_not_paused(&self) {
        require!(!self.is_paused.get_or_default(), "Contract is paused");
    }

    // ============ ADMIN FUNCTIONS ============

    pub fn pause(&mut self) {
        self.require_admin();
        self.is_paused.set(true);
    }

    pub fn unpause(&mut self) {
        self.require_admin();
        self.is_paused.set(false);
    }

    pub fn set_protocol_fee(&mut self, fee_bps: U256) {
        self.require_admin();
        require!(fee_bps <= U256::from(3000), "Fee too high"); // Max 30%
        self.protocol_fee_bps.set(fee_bps);
    }

    fn require_admin(&self) {
        require!(
            self.env().caller() == self.admin.get().expect("Admin not set"),
            "Not admin"
        );
    }
}
```

### 3.4 System Auction Interaction

**CRITICAL IMPLEMENTATION DETAIL:**

The System Auction contract on Casper allows delegation via these entry points:

```rust
// auction_interface.rs

impl ThawCore {
    /// Delegate CSPR to validator via System Auction
    fn delegate_to_validator(&self, amount: U512) {
        let validator = self.validator_public_key.get().expect("Validator not set");
        
        // System Auction contract hash (TESTNET)
        // IMPORTANT: Verify this hash from Casper testnet documentation
        let auction_hash = ContractHash::from_formatted_str(
            "hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2"
        ).expect("Invalid auction hash");
        
        // Call delegate entry point
        // The contract (self) becomes the delegator
        runtime::call_contract::<()>(
            auction_hash,
            "delegate",
            runtime_args! {
                "delegator" => self.env().self_address(),
                "validator" => validator,
                "amount" => amount,
            },
        );
    }

    /// Undelegate CSPR from validator
    fn undelegate_from_validator(&self, amount: U512) {
        let validator = self.validator_public_key.get().expect("Validator not set");
        
        let auction_hash = ContractHash::from_formatted_str(
            "hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2"
        ).expect("Invalid auction hash");
        
        runtime::call_contract::<()>(
            auction_hash,
            "undelegate",
            runtime_args! {
                "delegator" => self.env().self_address(),
                "validator" => validator,
                "amount" => amount,
            },
        );
    }

    /// Get pending rewards from System Auction
    fn get_pending_rewards(&self) -> U512 {
        let validator = self.validator_public_key.get().expect("Validator not set");
        
        let auction_hash = ContractHash::from_formatted_str(
            "hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2"
        ).expect("Invalid auction hash");
        
        // Query rewards
        runtime::call_contract::<U512>(
            auction_hash,
            "get_delegator_reward",
            runtime_args! {
                "delegator" => self.env().self_address(),
                "validator" => validator,
            },
        )
    }

    /// Withdraw rewards from System Auction
    fn withdraw_rewards(&self) {
        let validator = self.validator_public_key.get().expect("Validator not set");
        
        let auction_hash = ContractHash::from_formatted_str(
            "hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2"
        ).expect("Invalid auction hash");
        
        runtime::call_contract::<()>(
            auction_hash,
            "withdraw_delegator_reward",
            runtime_args! {
                "delegator" => self.env().self_address(),
                "validator" => validator,
            },
        );
    }
}
```

**⚠️ IMPORTANT NOTES FOR CLAUDE CODE:**

1. **Verify Auction Hash:** The hash above is from documentation - MUST verify on actual testnet before deployment

2. **Delegation Cost:** Each delegation costs 2.5 CSPR gas - factor this into minimum stake

3. **Unbonding Period:** Casper uses ~14 hours (1 era) unbonding - this is enforced at protocol level

4. **Rewards Distribution:** Rewards are distributed at end of each era (~2 hours), proportional to stake

5. **Odra Patterns:** Use `runtime::call_contract` for cross-contract calls - Odra wraps Casper SDK

---

### 3.5 thCSPR Token (CEP-18)

```rust
// thcspr_token.rs
use odra::prelude::*;
use odra_modules::cep18::Cep18;

#[odra::module]
pub struct StCsprToken {
    cep18: SubModule<Cep18>,
    minter: Var<Address>,  // Only Thaw Core can mint/burn
}

#[odra::module]
impl StCsprToken {
    #[odra(init)]
    pub fn init(&mut self, minter: Address) {
        self.cep18.init(
            "Staked CSPR".to_string(),
            "thCSPR".to_string(),
            9,  // Same decimals as CSPR
            U256::zero(),  // Initial supply
        );
        self.minter.set(minter);
    }

    /// Mint - only callable by Thaw Core
    pub fn mint(&mut self, to: Address, amount: U512) {
        self.require_minter();
        self.cep18.mint(&to, &U256::from(amount.as_u128()));
    }

    /// Burn - only callable by Thaw Core
    pub fn burn(&mut self, from: Address, amount: U512) {
        self.require_minter();
        self.cep18.burn(&from, &U256::from(amount.as_u128()));
    }

    // Standard CEP-18 passthrough
    pub fn transfer(&mut self, to: Address, amount: U256) {
        self.cep18.transfer(&to, &amount);
    }

    pub fn balance_of(&self, owner: Address) -> U256 {
        self.cep18.balance_of(&owner)
    }

    pub fn total_supply(&self) -> U256 {
        self.cep18.total_supply()
    }

    fn require_minter(&self) {
        require!(
            self.env().caller() == self.minter.get().expect("Minter not set"),
            "Not minter"
        );
    }
}
```

---

## 4. Events (CEP-88)

```rust
// events.rs
use odra::prelude::*;
use odra::casper_types::U512;

#[odra::event]
pub struct Staked {
    pub user: Address,
    pub cspr_amount: U512,
    pub thcspr_minted: U512,
    pub exchange_rate: U512,
}

#[odra::event]
pub struct Unstaked {
    pub user: Address,
    pub thcspr_burned: U512,
    pub cspr_amount: U512,
    pub withdrawal_id: u64,
    pub claimable_timestamp: u64,
}

#[odra::event]
pub struct Claimed {
    pub user: Address,
    pub withdrawal_id: u64,
    pub cspr_amount: U512,
}

#[odra::event]
pub struct Compounded {
    pub rewards_harvested: U512,
    pub protocol_fee: U512,
    pub rewards_to_pool: U512,
    pub new_exchange_rate: U512,
}
```

---

## 5. Configuration Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `min_stake` | 10 CSPR (10e9 motes) | Cover gas + meaningful stake |
| `protocol_fee_bps` | 1000 (10%) | Industry standard |
| `exchange_rate_precision` | 1e18 | Avoid rounding errors |
| `unbonding_time` | 14 hours | Casper protocol enforced |

---

## 6. Deployment Order

```bash
# 1. Deploy thCSPR token first (without minter)
casper-client put-deploy \
  --node-address http://localhost:7777 \
  --chain-name casper-test \
  --session-path target/wasm32-unknown-unknown/release/thcspr_token.wasm \
  --session-arg "minter:key='account-hash-PLACEHOLDER'"

# 2. Get thCSPR contract hash from deploy result

# 3. Deploy Thaw Core with thCSPR address
casper-client put-deploy \
  --node-address http://localhost:7777 \
  --chain-name casper-test \
  --session-path target/wasm32-unknown-unknown/release/thaw_core.wasm \
  --session-arg "thcspr_token:key='hash-STCSPR_HASH'" \
  --session-arg "validator:public_key='PUBLIC_KEY'" \
  --session-arg "treasury:key='account-hash-TREASURY'" \
  --session-arg "admin:key='account-hash-ADMIN'"

# 4. Update thCSPR minter to Thaw Core address
```

---

## 7. Test Scenarios

### Must Pass:

| Test | Input | Expected |
|------|-------|----------|
| Stake minimum | 10 CSPR | Receive 10 thCSPR (initial 1:1) |
| Stake below minimum | 5 CSPR | Revert "Below minimum" |
| Stake when paused | Any | Revert "Contract is paused" |
| Unstake full balance | All thCSPR | Withdrawal created, 14h wait |
| Unstake more than balance | 1000 thCSPR (has 100) | Revert "Insufficient" |
| Claim before unbonding | Immediately | Revert "Still unbonding" |
| Claim after unbonding | After 14h | Success, CSPR transferred |
| Compound with rewards | Rewards > 0 | Exchange rate increases |
| Compound no rewards | Rewards = 0 | Returns 0, no state change |
| Exchange rate after rewards | 1000 CSPR pool + 100 rewards | Rate = 1.1 |

### Edge Cases:

| Scenario | Expected Behavior |
|----------|-------------------|
| First deposit | 1:1 exchange rate |
| Deposit when rate > 1 | Receive fewer thCSPR |
| Multiple withdrawals | Each tracked separately |
| Compound multiple times | Rate increases each time |
| Admin pause during unstake | Unstake fails, existing withdrawals claimable |

---

## 8. Frontend Integration Points

```typescript
// Key contract calls from frontend

// Read exchange rate (view)
const rate = await contract.get_exchange_rate();
const rateDecimal = Number(rate) / 1e18;

// Stake CSPR
await contract.stake({ 
  paymentAmount: cspr_amount_in_motes 
});

// Get thCSPR balance
const balance = await thcspr_contract.balance_of(user_address);

// Unstake
const withdrawalId = await contract.unstake(thcspr_amount);

// Check withdrawal status
const withdrawals = await contract.get_user_withdrawals(user_address);
const canClaim = withdrawal.claimable_timestamp <= Date.now();

// Claim
await contract.claim(withdrawal_id);

// Compound (anyone can call)
await contract.compound();
```

---

## 9. Known Limitations & Workarounds

| Limitation | Workaround |
|------------|------------|
| Single validator MVP | Add multi-validator in v2 |
| 14h unbonding mandatory | UI shows clear timeline |
| No instant unstake | Could add buffer pool later |
| Rewards manual compound | Frontend auto-triggers |
| No slashing protection | Choose reliable validator |

---

## 10. References

- Odra Docs: https://odra.dev/docs
- Odra CEP-18: https://github.com/odradev/odra/tree/release/1.0.0/modules/src/cep18
- Casper Auction: https://docs.casper.network/concepts/economics/staking
- CEP-18 Standard: https://github.com/casper-ecosystem/cep18

---

**BUILD THIS FIRST. Everything else is scope creep.**
