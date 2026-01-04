//! Events for Thaw protocol (CEP-88 compliant)

use odra::prelude::*;
use odra::casper_types::U512;

/// Emitted when a user stakes CSPR
#[odra::event]
pub struct Staked {
    pub user: Address,
    pub cspr_amount: U512,
    pub thcspr_minted: U512,
    pub exchange_rate: U512,
}

/// Emitted when a user requests to unstake
#[odra::event]
pub struct Unstaked {
    pub user: Address,
    pub thcspr_burned: U512,
    pub cspr_amount: U512,
    pub withdrawal_id: u64,
    pub claimable_timestamp: u64,
}

/// Emitted when a user claims their unstaked CSPR
#[odra::event]
pub struct Claimed {
    pub user: Address,
    pub withdrawal_id: u64,
    pub cspr_amount: U512,
}

/// Emitted when rewards are compounded
#[odra::event]
pub struct Compounded {
    pub rewards_harvested: U512,
    pub protocol_fee: U512,
    pub rewards_to_pool: U512,
    pub new_exchange_rate: U512,
}

/// Emitted when contract is paused
#[odra::event]
pub struct Paused {
    pub by: Address,
}

/// Emitted when contract is unpaused
#[odra::event]
pub struct Unpaused {
    pub by: Address,
}

/// Emitted when protocol fee is updated
#[odra::event]
pub struct FeeUpdated {
    pub old_fee_bps: u64,
    pub new_fee_bps: u64,
}

/// Emitted when admin is transferred
#[odra::event]
pub struct AdminTransferred {
    pub old_admin: Address,
    pub new_admin: Address,
}

// ============ LENDING POOL EVENTS ============

/// Emitted when a lender deposits CSPR to the lending pool
#[odra::event]
pub struct Deposited {
    pub lender: Address,
    pub amount: U512,
    pub total_deposits: U512,
}

/// Emitted when a lender withdraws from the lending pool
#[odra::event]
pub struct Withdrawn {
    pub lender: Address,
    pub amount: U512,
    pub interest_earned: U512,
}

/// Emitted when a user deposits thCSPR as collateral
#[odra::event]
pub struct CollateralDeposited {
    pub user: Address,
    pub amount: U512,
    pub total_collateral: U512,
}

/// Emitted when a user withdraws thCSPR collateral
#[odra::event]
pub struct CollateralWithdrawn {
    pub user: Address,
    pub amount: U512,
    pub remaining_collateral: U512,
}

/// Emitted when a user borrows CSPR
#[odra::event]
pub struct Borrowed {
    pub borrower: Address,
    pub amount: U512,
    pub total_borrowed: U512,
    pub collateral_value: U512,
}

/// Emitted when a user repays borrowed CSPR
#[odra::event]
pub struct Repaid {
    pub borrower: Address,
    pub amount: U512,
    pub remaining_debt: U512,
}

/// Emitted when a position is liquidated
#[odra::event]
pub struct Liquidated {
    pub liquidator: Address,
    pub borrower: Address,
    pub repaid_amount: U512,
    pub collateral_seized: U512,
}

/// Emitted when a user performs leveraged staking
#[odra::event]
pub struct LeveragedStake {
    pub user: Address,
    pub initial_amount: U512,
    pub total_staked: U512,
    pub total_thcspr: U512,
    pub leverage_loops: u8,
}
