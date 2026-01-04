//! LendingPool - Enables leveraged staking on Thaw
//!
//! This contract allows:
//! - Lenders to deposit CSPR and earn interest from borrowers
//! - Stakers to use thCSPR as collateral to borrow CSPR
//! - Leveraged staking by recursively staking borrowed CSPR

use odra::prelude::*;
use odra::casper_types::U512;
use odra::ContractRef;

use crate::errors::LendingError;
use crate::events::{
    Deposited, Withdrawn, CollateralDeposited, CollateralWithdrawn,
    Borrowed, Repaid, Liquidated, LeveragedStake
};
use crate::thcspr_token::ThCsprTokenContractRef;
use crate::thaw_core::ThawCoreContractRef;

/// LendingPool for leveraged staking
#[odra::module]
pub struct LendingPool {
    // Core references
    thaw_core: Var<Address>,
    thcspr_token: Var<Address>,

    // Pool state
    total_deposits: Var<U512>,
    total_borrowed: Var<U512>,

    // User balances (combined in mappings)
    lender_deposits: Mapping<Address, U512>,
    collateral_balances: Mapping<Address, U512>,
    borrowed_balances: Mapping<Address, U512>,

    // Configuration (75% collateral factor, 80% liquidation, 5% bonus packed)
    config: Var<U512>,  // Packed: collateral_factor | liq_threshold | liq_bonus | base_rate

    // Admin
    admin: Var<Address>,
}

// Constants
const PRECISION: u128 = 1_000_000_000_000_000_000; // 1e18
const BPS_PRECISION: u64 = 10_000; // 100% = 10000 bps

// Default parameters (packed into config)
const DEFAULT_COLLATERAL_FACTOR: u64 = 7500; // 75%
const DEFAULT_LIQUIDATION_THRESHOLD: u64 = 8000; // 80%
const DEFAULT_LIQUIDATION_BONUS: u64 = 500; // 5%
const DEFAULT_BASE_RATE: u64 = 500; // 5% base APR

#[odra::module]
impl LendingPool {
    /// Initialize the lending pool
    pub fn init(
        &mut self,
        thaw_core: Address,
        thcspr_token: Address,
        admin: Address,
    ) {
        self.thaw_core.set(thaw_core);
        self.thcspr_token.set(thcspr_token);
        self.admin.set(admin);
        self.total_deposits.set(U512::zero());
        self.total_borrowed.set(U512::zero());

        // Pack config: collateral_factor (16 bits) | liq_threshold (16 bits) | liq_bonus (16 bits) | base_rate (16 bits)
        let config = U512::from(DEFAULT_COLLATERAL_FACTOR)
            | (U512::from(DEFAULT_LIQUIDATION_THRESHOLD) << 16)
            | (U512::from(DEFAULT_LIQUIDATION_BONUS) << 32)
            | (U512::from(DEFAULT_BASE_RATE) << 48);
        self.config.set(config);
    }

    // ============ LENDER FUNCTIONS ============

    /// Deposit CSPR to the lending pool to earn interest
    #[odra(payable)]
    pub fn deposit(&mut self) {
        let caller = self.env().caller();
        let amount = self.env().attached_value();

        if amount == U512::zero() {
            self.env().revert(LendingError::AmountMustBePositive);
        }

        let current = self.lender_deposits.get(&caller).unwrap_or_default();
        self.lender_deposits.set(&caller, current + amount);

        let new_total = self.total_deposits.get_or_default() + amount;
        self.total_deposits.set(new_total);

        self.env().emit_event(Deposited {
            lender: caller,
            amount,
            total_deposits: new_total,
        });
    }

    /// Withdraw CSPR from lending pool
    pub fn withdraw(&mut self, amount: U512) {
        let caller = self.env().caller();
        let deposit = self.lender_deposits.get(&caller).unwrap_or_default();

        if amount > deposit {
            self.env().revert(LendingError::InsufficientDeposit);
        }

        let available = self.get_available_liquidity();
        if amount > available {
            self.env().revert(LendingError::InsufficientLiquidity);
        }

        self.lender_deposits.set(&caller, deposit - amount);
        let new_total = self.total_deposits.get_or_default() - amount;
        self.total_deposits.set(new_total);

        self.env().transfer_tokens(&caller, &amount);

        self.env().emit_event(Withdrawn {
            lender: caller,
            amount,
            interest_earned: U512::zero(), // Simplified for hackathon
        });
    }

    // ============ BORROWER FUNCTIONS ============

    /// Deposit thCSPR as collateral
    pub fn deposit_collateral(&mut self, amount: U512) {
        let caller = self.env().caller();

        if amount == U512::zero() {
            self.env().revert(LendingError::AmountMustBePositive);
        }

        // Transfer thCSPR from caller to this contract
        let thcspr = self.thcspr_token.get().unwrap_or_revert(&self.env());
        ThCsprTokenContractRef::new(self.env(), thcspr)
            .transfer_from(caller, self.env().self_address(), amount.as_u128().into());

        let current = self.collateral_balances.get(&caller).unwrap_or_default();
        self.collateral_balances.set(&caller, current + amount);

        self.env().emit_event(CollateralDeposited {
            user: caller,
            amount,
            total_collateral: current + amount,
        });
    }

    /// Withdraw thCSPR collateral (if health allows)
    pub fn withdraw_collateral(&mut self, amount: U512) {
        let caller = self.env().caller();
        let collateral = self.collateral_balances.get(&caller).unwrap_or_default();

        if amount > collateral {
            self.env().revert(LendingError::InsufficientCollateral);
        }

        // Check health after withdrawal
        let new_collateral = collateral - amount;
        let borrowed = self.borrowed_balances.get(&caller).unwrap_or_default();

        if borrowed > U512::zero() {
            let collateral_value = self.get_collateral_value(new_collateral);
            let max_borrow = self.calculate_max_borrow(collateral_value);
            if borrowed > max_borrow {
                self.env().revert(LendingError::WouldBecomeUndercollateralized);
            }
        }

        self.collateral_balances.set(&caller, new_collateral);

        let thcspr = self.thcspr_token.get().unwrap_or_revert(&self.env());
        ThCsprTokenContractRef::new(self.env(), thcspr)
            .transfer(caller, amount.as_u128().into());

        self.env().emit_event(CollateralWithdrawn {
            user: caller,
            amount,
            remaining_collateral: new_collateral,
        });
    }

    /// Borrow CSPR against thCSPR collateral
    pub fn borrow(&mut self, amount: U512) {
        let caller = self.env().caller();

        if amount == U512::zero() {
            self.env().revert(LendingError::AmountMustBePositive);
        }

        let available = self.get_available_liquidity();
        if amount > available {
            self.env().revert(LendingError::InsufficientLiquidity);
        }

        // Check collateral
        let collateral = self.collateral_balances.get(&caller).unwrap_or_default();
        let collateral_value = self.get_collateral_value(collateral);
        let max_borrow = self.calculate_max_borrow(collateral_value);

        let current_borrowed = self.borrowed_balances.get(&caller).unwrap_or_default();
        let total_debt = current_borrowed + amount;

        if total_debt > max_borrow {
            self.env().revert(LendingError::ExceedsMaxBorrow);
        }

        self.borrowed_balances.set(&caller, total_debt);
        let new_total_borrowed = self.total_borrowed.get_or_default() + amount;
        self.total_borrowed.set(new_total_borrowed);

        self.env().transfer_tokens(&caller, &amount);

        self.env().emit_event(Borrowed {
            borrower: caller,
            amount,
            total_borrowed: total_debt,
            collateral_value,
        });
    }

    /// Repay borrowed CSPR
    #[odra(payable)]
    pub fn repay(&mut self) {
        let caller = self.env().caller();
        let amount = self.env().attached_value();

        let borrowed = self.borrowed_balances.get(&caller).unwrap_or_default();

        let repay_amount = if amount > borrowed {
            // Refund excess
            let excess = amount - borrowed;
            self.env().transfer_tokens(&caller, &excess);
            borrowed
        } else {
            amount
        };

        self.borrowed_balances.set(&caller, borrowed - repay_amount);
        let new_total_borrowed = self.total_borrowed.get_or_default() - repay_amount;
        self.total_borrowed.set(new_total_borrowed);

        self.env().emit_event(Repaid {
            borrower: caller,
            amount: repay_amount,
            remaining_debt: borrowed - repay_amount,
        });
    }

    // ============ LEVERAGED STAKING ============

    /// One-click leveraged staking (up to 4x leverage)
    ///
    /// 1. Stakes initial CSPR to get thCSPR
    /// 2. Uses thCSPR as collateral to borrow more CSPR
    /// 3. Repeats for amplified exposure
    #[odra(payable)]
    pub fn leverage_stake(&mut self, loops: u8) -> U512 {
        let caller = self.env().caller();
        let initial_amount = self.env().attached_value();

        if initial_amount == U512::zero() {
            self.env().revert(LendingError::AmountMustBePositive);
        }

        if loops == 0 || loops > 4 {
            self.env().revert(LendingError::InvalidLoopCount);
        }

        let thaw_core = self.thaw_core.get().unwrap_or_revert(&self.env());
        let collateral_factor = self.get_collateral_factor();

        let mut total_staked = U512::zero();
        let mut total_thcspr = U512::zero();
        let mut amount_to_stake = initial_amount;

        for i in 0..loops {
            // Stake CSPR to get thCSPR
            let thcspr_received = ThawCoreContractRef::new(self.env(), thaw_core)
                .with_tokens(amount_to_stake)
                .stake();

            total_staked = total_staked + amount_to_stake;
            total_thcspr = total_thcspr + thcspr_received;

            // If not last loop, borrow more
            if i < loops - 1 {
                // Add thCSPR as collateral
                let current_collateral = self.collateral_balances.get(&caller).unwrap_or_default();
                self.collateral_balances.set(&caller, current_collateral + thcspr_received);

                // Calculate borrow amount
                let collateral_value = self.get_collateral_value(thcspr_received);
                let borrow_amount = collateral_value * U512::from(collateral_factor) / U512::from(BPS_PRECISION);

                // Check liquidity
                let available = self.get_available_liquidity();
                if borrow_amount > available {
                    break; // Exit early if not enough liquidity
                }

                // Record borrow
                let current_borrowed = self.borrowed_balances.get(&caller).unwrap_or_default();
                self.borrowed_balances.set(&caller, current_borrowed + borrow_amount);

                let new_total_borrowed = self.total_borrowed.get_or_default() + borrow_amount;
                self.total_borrowed.set(new_total_borrowed);

                amount_to_stake = borrow_amount;
            }
        }

        self.env().emit_event(LeveragedStake {
            user: caller,
            initial_amount,
            total_staked,
            total_thcspr,
            leverage_loops: loops,
        });

        total_thcspr
    }

    // ============ LIQUIDATION ============

    /// Liquidate an undercollateralized position
    #[odra(payable)]
    pub fn liquidate(&mut self, borrower: Address) {
        let caller = self.env().caller();
        let repay_amount = self.env().attached_value();

        // Check position is liquidatable
        let health = self.get_health_factor(borrower);
        if health >= U512::from(PRECISION) {
            self.env().revert(LendingError::PositionHealthy);
        }

        let borrowed = self.borrowed_balances.get(&borrower).unwrap_or_default();
        let collateral = self.collateral_balances.get(&borrower).unwrap_or_default();

        // Can repay up to 50% of debt
        let max_repay = borrowed / U512::from(2u64);
        let actual_repay = if repay_amount > max_repay { max_repay } else { repay_amount };

        // Refund excess
        if repay_amount > actual_repay {
            self.env().transfer_tokens(&caller, &(repay_amount - actual_repay));
        }

        // Calculate collateral to seize (with 5% bonus)
        let liq_bonus = self.get_liquidation_bonus();
        let collateral_to_seize = self.cspr_to_thcspr(actual_repay)
            * U512::from(BPS_PRECISION + liq_bonus)
            / U512::from(BPS_PRECISION);

        let seize_amount = if collateral_to_seize > collateral {
            collateral
        } else {
            collateral_to_seize
        };

        // Update borrower state
        self.collateral_balances.set(&borrower, collateral - seize_amount);
        self.borrowed_balances.set(&borrower, borrowed - actual_repay);

        let new_total_borrowed = self.total_borrowed.get_or_default() - actual_repay;
        self.total_borrowed.set(new_total_borrowed);

        // Transfer collateral to liquidator
        let thcspr = self.thcspr_token.get().unwrap_or_revert(&self.env());
        ThCsprTokenContractRef::new(self.env(), thcspr)
            .transfer(caller, seize_amount.as_u128().into());

        self.env().emit_event(Liquidated {
            liquidator: caller,
            borrower,
            repaid_amount: actual_repay,
            collateral_seized: seize_amount,
        });
    }

    // ============ VIEW FUNCTIONS ============

    /// Get available liquidity for borrowing
    pub fn get_available_liquidity(&self) -> U512 {
        let deposits = self.total_deposits.get_or_default();
        let borrowed = self.total_borrowed.get_or_default();
        if deposits > borrowed { deposits - borrowed } else { U512::zero() }
    }

    /// Get user's health factor (1e18 = healthy, below = liquidatable)
    pub fn get_health_factor(&self, user: Address) -> U512 {
        let collateral = self.collateral_balances.get(&user).unwrap_or_default();
        let borrowed = self.borrowed_balances.get(&user).unwrap_or_default();

        if borrowed == U512::zero() {
            return U512::MAX;
        }

        let collateral_value = self.get_collateral_value(collateral);
        let liq_threshold = self.get_liquidation_threshold();

        collateral_value * U512::from(liq_threshold) * U512::from(PRECISION)
            / (borrowed * U512::from(BPS_PRECISION))
    }

    /// Get maximum additional borrow for user
    pub fn get_max_borrow(&self, user: Address) -> U512 {
        let collateral = self.collateral_balances.get(&user).unwrap_or_default();
        let collateral_value = self.get_collateral_value(collateral);
        let max_total = self.calculate_max_borrow(collateral_value);

        let current = self.borrowed_balances.get(&user).unwrap_or_default();
        if max_total > current { max_total - current } else { U512::zero() }
    }

    /// Get user's position: (collateral, borrowed)
    pub fn get_position(&self, user: Address) -> (U512, U512) {
        (
            self.collateral_balances.get(&user).unwrap_or_default(),
            self.borrowed_balances.get(&user).unwrap_or_default(),
        )
    }

    /// Get total deposits in pool
    pub fn get_total_deposits(&self) -> U512 {
        self.total_deposits.get_or_default()
    }

    /// Get total borrowed from pool
    pub fn get_total_borrowed(&self) -> U512 {
        self.total_borrowed.get_or_default()
    }

    /// Get lender deposit amount
    pub fn get_lender_deposit(&self, user: Address) -> U512 {
        self.lender_deposits.get(&user).unwrap_or_default()
    }

    // ============ CONFIG HELPERS ============

    fn get_collateral_factor(&self) -> u64 {
        let config = self.config.get_or_default();
        (config & U512::from(0xFFFFu64)).as_u64()
    }

    fn get_liquidation_threshold(&self) -> u64 {
        let config = self.config.get_or_default();
        ((config >> 16) & U512::from(0xFFFFu64)).as_u64()
    }

    fn get_liquidation_bonus(&self) -> u64 {
        let config = self.config.get_or_default();
        ((config >> 32) & U512::from(0xFFFFu64)).as_u64()
    }

    // ============ INTERNAL FUNCTIONS ============

    fn get_collateral_value(&self, thcspr_amount: U512) -> U512 {
        let thaw_core = self.thaw_core.get().unwrap_or_revert(&self.env());
        let exchange_rate = ThawCoreContractRef::new(self.env(), thaw_core).get_exchange_rate();
        thcspr_amount * exchange_rate / U512::from(PRECISION)
    }

    fn calculate_max_borrow(&self, collateral_value: U512) -> U512 {
        let factor = self.get_collateral_factor();
        collateral_value * U512::from(factor) / U512::from(BPS_PRECISION)
    }

    fn cspr_to_thcspr(&self, cspr_amount: U512) -> U512 {
        let thaw_core = self.thaw_core.get().unwrap_or_revert(&self.env());
        let exchange_rate = ThawCoreContractRef::new(self.env(), thaw_core).get_exchange_rate();
        cspr_amount * U512::from(PRECISION) / exchange_rate
    }

    // ============ ADMIN ============

    pub fn set_config(&mut self, collateral_factor: u64, liq_threshold: u64, liq_bonus: u64) {
        self.require_admin();
        let config = U512::from(collateral_factor)
            | (U512::from(liq_threshold) << 16)
            | (U512::from(liq_bonus) << 32);
        self.config.set(config);
    }

    fn require_admin(&self) {
        let admin = self.admin.get().unwrap_or_revert(&self.env());
        if self.env().caller() != admin {
            self.env().revert(LendingError::NotAdmin);
        }
    }
}
