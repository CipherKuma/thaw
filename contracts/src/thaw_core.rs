//! ThawCore - Main liquid staking contract
//!
//! This contract implements liquid staking for Casper Network using Odra's native
//! delegation methods which internally use the System Auction.

use alloc::vec::Vec;
use odra::prelude::*;
use odra::casper_types::{PublicKey, U512};
use odra::ContractRef;

use crate::errors::Error;
use crate::events::{AdminTransferred, Claimed, Compounded, FeeUpdated, Paused, Staked, Unpaused, Unstaked};
use crate::thcspr_token::ThCsprTokenContractRef;

/// Withdrawal request structure
#[odra::odra_type]
pub struct WithdrawalRequest {
    pub id: u64,
    pub user: Address,
    pub cspr_amount: U512,
    pub thcspr_burned: U512,
    pub request_timestamp: u64,
    pub claimable_timestamp: u64,
    pub claimed: bool,
}

/// ThawCore - Main liquid staking contract
#[odra::module]
pub struct ThawCore {
    // Token reference
    thcspr_token: Var<Address>,

    // Pool state
    total_pooled_cspr: Var<U512>,
    total_thcspr_supply: Var<U512>,

    // Staking config
    validator_public_key: Var<PublicKey>,

    // Fees (basis points, 10000 = 100%)
    protocol_fee_bps: Var<u64>,
    treasury: Var<Address>,

    // Withdrawals
    withdrawal_counter: Var<u64>,
    withdrawals: Mapping<u64, WithdrawalRequest>,
    user_withdrawals: Mapping<Address, Vec<u64>>,

    // Admin
    admin: Var<Address>,
    is_paused: Var<bool>,

    // Constants
    min_stake: Var<U512>,
}

// Constants
const EXCHANGE_RATE_PRECISION: u128 = 1_000_000_000_000_000_000; // 1e18
const DEFAULT_MIN_STAKE: u64 = 10_000_000_000; // 10 CSPR in motes
const DEFAULT_FEE_BPS: u64 = 1000; // 10%
const MAX_FEE_BPS: u64 = 3000; // 30%
const UNBONDING_PERIOD_MS: u64 = 14 * 60 * 60 * 1000; // 14 hours

#[odra::module]
impl ThawCore {
    /// Initialize the contract
    ///
    /// # Arguments
    /// * `thcspr_token` - Address of the thCSPR token contract
    /// * `validator` - Public key of the validator to delegate to
    /// * `treasury` - Address where protocol fees are sent
    /// * `admin` - Admin address for contract management
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
        self.protocol_fee_bps.set(DEFAULT_FEE_BPS);
        self.min_stake.set(U512::from(DEFAULT_MIN_STAKE));
        self.total_pooled_cspr.set(U512::zero());
        self.total_thcspr_supply.set(U512::zero());
        self.is_paused.set(false);
        self.withdrawal_counter.set(0);
    }

    // ============ CORE FUNCTIONS ============

    /// Stake CSPR and receive thCSPR
    #[odra(payable)]
    pub fn stake(&mut self) -> U512 {
        self.require_not_paused();

        let caller = self.env().caller();
        let cspr_amount = self.env().attached_value();

        // Validate minimum
        let min = self.min_stake.get_or_default();
        if cspr_amount < min {
            self.env().revert(Error::BelowMinimumStake);
        }

        // Calculate thCSPR to mint
        let thcspr_amount = self.cspr_to_thcspr(cspr_amount);

        // Update state BEFORE external calls (CEI pattern)
        let new_total_pooled = self.total_pooled_cspr.get_or_default() + cspr_amount;
        let new_total_supply = self.total_thcspr_supply.get_or_default() + thcspr_amount;
        self.total_pooled_cspr.set(new_total_pooled);
        self.total_thcspr_supply.set(new_total_supply);

        // Mint thCSPR to user via cross-contract call
        self.mint_thcspr(caller, thcspr_amount);

        // Delegate CSPR to validator via System Auction
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

        // Validate amount
        if thcspr_amount == U512::zero() {
            self.env().revert(Error::AmountMustBePositive);
        }

        // Validate user has sufficient thCSPR balance
        let balance = self.get_thcspr_balance(caller);
        if balance < thcspr_amount {
            self.env().revert(Error::InsufficientBalance);
        }

        // Calculate CSPR to return
        let cspr_amount = self.thcspr_to_cspr(thcspr_amount);

        // Update state BEFORE external calls (CEI pattern)
        let new_total_pooled = self.total_pooled_cspr.get_or_default() - cspr_amount;
        let new_total_supply = self.total_thcspr_supply.get_or_default() - thcspr_amount;
        self.total_pooled_cspr.set(new_total_pooled);
        self.total_thcspr_supply.set(new_total_supply);

        // Burn thCSPR via cross-contract call
        self.burn_thcspr(caller, thcspr_amount);

        // Undelegate from validator via System Auction
        self.undelegate_from_validator(cspr_amount);

        // Create withdrawal request
        let withdrawal_id = self.withdrawal_counter.get_or_default();
        self.withdrawal_counter.set(withdrawal_id + 1);

        let now = self.env().get_block_time();
        let claimable = now + UNBONDING_PERIOD_MS;

        let request = WithdrawalRequest {
            id: withdrawal_id,
            user: caller,
            cspr_amount,
            thcspr_burned: thcspr_amount,
            request_timestamp: now,
            claimable_timestamp: claimable,
            claimed: false,
        };

        self.withdrawals.set(&withdrawal_id, request);

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

        let mut request = self
            .withdrawals
            .get(&withdrawal_id)
            .unwrap_or_revert_with(&self.env(), Error::WithdrawalNotFound);

        if request.user != caller {
            self.env().revert(Error::NotWithdrawalOwner);
        }

        if request.claimed {
            self.env().revert(Error::AlreadyClaimed);
        }

        if self.env().get_block_time() < request.claimable_timestamp {
            self.env().revert(Error::StillUnbonding);
        }

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
    ///
    /// This function:
    /// 1. Gets pending rewards from the System Auction
    /// 2. Withdraws the rewards
    /// 3. Deducts protocol fee and sends to treasury
    /// 4. Adds remaining rewards to the pool (increases exchange rate)
    /// 5. Re-delegates rewards to validator for compounding
    pub fn compound(&mut self) -> U512 {
        // Get pending rewards from System Auction
        let rewards = self.get_pending_rewards();

        if rewards == U512::zero() {
            return U512::zero();
        }

        // Withdraw rewards from System Auction
        self.withdraw_rewards();

        // Calculate protocol fee
        let fee_bps = self.protocol_fee_bps.get_or_default();
        let protocol_fee = rewards * U512::from(fee_bps) / U512::from(10000u64);
        let rewards_to_pool = rewards - protocol_fee;

        // Send fee to treasury
        if protocol_fee > U512::zero() {
            let treasury = self.treasury.get().unwrap_or_revert_with(&self.env(), Error::TreasuryNotSet);
            self.env().transfer_tokens(&treasury, &protocol_fee);
        }

        // Add rewards to pool (increases exchange rate)
        let new_total = self.total_pooled_cspr.get_or_default() + rewards_to_pool;
        self.total_pooled_cspr.set(new_total);

        // Re-delegate rewards to validator for compounding
        if rewards_to_pool > U512::zero() {
            self.delegate_to_validator(rewards_to_pool);
        }

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
    pub fn get_exchange_rate(&self) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();

        if total_supply == U512::zero() {
            return U512::from(EXCHANGE_RATE_PRECISION);
        }

        (total_pooled * U512::from(EXCHANGE_RATE_PRECISION)) / total_supply
    }

    pub fn get_total_pooled(&self) -> U512 {
        self.total_pooled_cspr.get_or_default()
    }

    pub fn get_total_supply(&self) -> U512 {
        self.total_thcspr_supply.get_or_default()
    }

    pub fn get_min_stake(&self) -> U512 {
        self.min_stake.get_or_default()
    }

    pub fn get_protocol_fee_bps(&self) -> u64 {
        self.protocol_fee_bps.get_or_default()
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused.get_or_default()
    }

    pub fn get_withdrawal(&self, withdrawal_id: u64) -> Option<WithdrawalRequest> {
        self.withdrawals.get(&withdrawal_id)
    }

    pub fn get_user_withdrawals(&self, user: Address) -> Vec<WithdrawalRequest> {
        let ids = self.user_withdrawals.get(&user).unwrap_or_default();
        ids.iter()
            .filter_map(|id| self.withdrawals.get(id))
            .collect()
    }

    /// Get the configured validator public key
    pub fn get_validator(&self) -> Option<PublicKey> {
        self.validator_public_key.get()
    }

    /// Get the treasury address
    pub fn get_treasury(&self) -> Option<Address> {
        self.treasury.get()
    }

    /// Get the admin address
    pub fn get_admin(&self) -> Option<Address> {
        self.admin.get()
    }

    // ============ INTERNAL FUNCTIONS ============

    fn cspr_to_thcspr(&self, cspr_amount: U512) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();

        if total_supply == U512::zero() || total_pooled == U512::zero() {
            return cspr_amount;
        }

        (cspr_amount * total_supply) / total_pooled
    }

    fn thcspr_to_cspr(&self, thcspr_amount: U512) -> U512 {
        let total_pooled = self.total_pooled_cspr.get_or_default();
        let total_supply = self.total_thcspr_supply.get_or_default();

        if total_supply == U512::zero() {
            return U512::zero();
        }

        (thcspr_amount * total_pooled) / total_supply
    }

    fn require_not_paused(&self) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
    }

    fn require_admin(&self) {
        let admin = self.admin.get().unwrap_or_revert_with(&self.env(), Error::AdminNotSet);
        if self.env().caller() != admin {
            self.env().revert(Error::NotAdmin);
        }
    }

    /// Mint thCSPR to user via cross-contract call
    fn mint_thcspr(&self, to: Address, amount: U512) {
        let token_address = self
            .thcspr_token
            .get()
            .unwrap_or_revert_with(&self.env(), Error::TokenNotSet);
        ThCsprTokenContractRef::new(self.env(), token_address).mint(to, amount);
    }

    /// Burn thCSPR from user via cross-contract call
    fn burn_thcspr(&self, from: Address, amount: U512) {
        let token_address = self
            .thcspr_token
            .get()
            .unwrap_or_revert_with(&self.env(), Error::TokenNotSet);
        ThCsprTokenContractRef::new(self.env(), token_address).burn(from, amount);
    }

    /// Get thCSPR balance of a user via cross-contract call
    fn get_thcspr_balance(&self, user: Address) -> U512 {
        let token_address = self
            .thcspr_token
            .get()
            .unwrap_or_revert_with(&self.env(), Error::TokenNotSet);
        let balance_u256 = ThCsprTokenContractRef::new(self.env(), token_address).balance_of(user);
        // Convert U256 to U512
        U512::from(balance_u256.as_u128())
    }

    // ============ DELEGATION FUNCTIONS (using Odra native methods) ============

    /// Delegate CSPR to validator using Odra's native delegation
    ///
    /// Uses `self.env().delegate()` which internally calls the System Auction
    /// with the correct address for the current network.
    ///
    /// # Arguments
    /// * `amount` - Amount of CSPR to delegate (in motes)
    fn delegate_to_validator(&self, amount: U512) {
        let validator = self
            .validator_public_key
            .get()
            .unwrap_or_revert_with(&self.env(), Error::ValidatorNotSet);

        // Use Odra's native delegation method
        // This internally uses system::get_auction() to get the correct auction address
        self.env().delegate(validator, amount);
    }

    /// Undelegate CSPR from validator using Odra's native undelegation
    ///
    /// Uses `self.env().undelegate()` which internally calls the System Auction.
    ///
    /// # Arguments
    /// * `amount` - Amount of CSPR to undelegate (in motes)
    ///
    /// # Note
    /// Unbonding takes 14 hours (1 era) on Casper 2.0
    fn undelegate_from_validator(&self, amount: U512) {
        let validator = self
            .validator_public_key
            .get()
            .unwrap_or_revert_with(&self.env(), Error::ValidatorNotSet);

        // Use Odra's native undelegation method
        self.env().undelegate(validator, amount);
    }

    /// Get currently delegated amount from validator
    ///
    /// # Returns
    /// Amount of CSPR currently delegated in motes
    fn get_delegated_amount(&self) -> U512 {
        let validator = self
            .validator_public_key
            .get()
            .unwrap_or_revert_with(&self.env(), Error::ValidatorNotSet);

        // Use Odra's native method to get delegated amount
        self.env().delegated_amount(validator)
    }

    /// Get pending staking rewards
    ///
    /// # Returns
    /// Amount of pending rewards in motes
    ///
    /// # Note
    /// This calculates rewards based on the difference between
    /// total pooled CSPR and actual delegated amount
    fn get_pending_rewards(&self) -> U512 {
        // In Odra's native approach, we track rewards through the difference
        // between what we expect (total_pooled) and what's actually delegated
        let delegated = self.get_delegated_amount();
        let total_pooled = self.total_pooled_cspr.get_or_default();

        // Rewards = actual delegated amount - tracked pooled amount
        // (when rewards accrue, delegated amount grows)
        if delegated > total_pooled {
            delegated - total_pooled
        } else {
            U512::zero()
        }
    }

    /// Withdraw accumulated staking rewards
    ///
    /// # Note
    /// With Odra's native delegation, rewards automatically compound.
    /// This function updates our tracking to reflect the new balance.
    fn withdraw_rewards(&self) {
        // With native delegation, rewards are automatically added to the stake
        // No explicit withdrawal needed - we just update our tracking
    }

    // ============ ADMIN FUNCTIONS ============

    pub fn pause(&mut self) {
        self.require_admin();
        self.is_paused.set(true);
        self.env().emit_event(Paused {
            by: self.env().caller(),
        });
    }

    pub fn unpause(&mut self) {
        self.require_admin();
        self.is_paused.set(false);
        self.env().emit_event(Unpaused {
            by: self.env().caller(),
        });
    }

    pub fn set_protocol_fee(&mut self, fee_bps: u64) {
        self.require_admin();
        if fee_bps > MAX_FEE_BPS {
            self.env().revert(Error::FeeTooHigh);
        }
        let old_fee = self.protocol_fee_bps.get_or_default();
        self.protocol_fee_bps.set(fee_bps);
        self.env().emit_event(FeeUpdated {
            old_fee_bps: old_fee,
            new_fee_bps: fee_bps,
        });
    }

    pub fn set_min_stake(&mut self, min_stake: U512) {
        self.require_admin();
        self.min_stake.set(min_stake);
    }

    pub fn set_treasury(&mut self, treasury: Address) {
        self.require_admin();
        self.treasury.set(treasury);
    }

    pub fn set_validator(&mut self, validator: PublicKey) {
        self.require_admin();
        // WARNING: Changing validator requires migration strategy
        self.validator_public_key.set(validator);
    }

    pub fn transfer_admin(&mut self, new_admin: Address) {
        self.require_admin();
        let old_admin = self.admin.get().unwrap_or_revert_with(&self.env(), Error::AdminNotSet);
        self.admin.set(new_admin);
        self.env().emit_event(AdminTransferred {
            old_admin,
            new_admin,
        });
    }

    /// Update the thCSPR token contract address (admin only)
    ///
    /// This is useful for:
    /// - Initial setup when contracts have circular dependencies
    /// - Migrating to a new token contract
    ///
    /// # Arguments
    /// * `thcspr_token` - New thCSPR token contract address
    pub fn set_thcspr_token(&mut self, thcspr_token: Address) {
        self.require_admin();
        self.thcspr_token.set(thcspr_token);
    }
}
