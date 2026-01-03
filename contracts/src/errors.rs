//! Error definitions for Thaw protocol

use odra::prelude::*;

/// Thaw protocol errors
#[odra::odra_error]
pub enum Error {
    /// Stake amount is below minimum required
    BelowMinimumStake = 1,
    /// Contract is currently paused
    ContractPaused = 2,
    /// Insufficient thCSPR balance for unstake
    InsufficientBalance = 3,
    /// Amount must be greater than zero
    AmountMustBePositive = 4,
    /// Withdrawal request not found
    WithdrawalNotFound = 5,
    /// Withdrawal does not belong to caller
    NotWithdrawalOwner = 6,
    /// Withdrawal has already been claimed
    AlreadyClaimed = 7,
    /// Unbonding period has not completed
    StillUnbonding = 8,
    /// Caller is not admin
    NotAdmin = 9,
    /// Caller is not authorized minter
    NotMinter = 10,
    /// Protocol fee exceeds maximum allowed (30%)
    FeeTooHigh = 11,
    /// Validator public key not set
    ValidatorNotSet = 12,
    /// Treasury address not set
    TreasuryNotSet = 13,
    /// Admin address not set
    AdminNotSet = 14,
    /// Minter address not set
    MinterNotSet = 15,
    /// Token address not set
    TokenNotSet = 16,
}

/// Lending pool errors
#[odra::odra_error]
pub enum LendingError {
    /// Amount must be greater than zero
    AmountMustBePositive = 100,
    /// Insufficient deposit balance
    InsufficientDeposit = 101,
    /// Insufficient liquidity in pool
    InsufficientLiquidity = 102,
    /// Insufficient collateral
    InsufficientCollateral = 103,
    /// Borrow would exceed max allowed
    ExceedsMaxBorrow = 104,
    /// Position would become undercollateralized
    WouldBecomeUndercollateralized = 105,
    /// Position is healthy, cannot liquidate
    PositionHealthy = 106,
    /// Invalid parameter value
    InvalidParameter = 107,
    /// Invalid loop count for leverage (1-5)
    InvalidLoopCount = 108,
    /// Caller is not admin
    NotAdmin = 109,
}
