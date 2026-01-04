//! System Auction interface for Casper Network delegation
//!
//! This module provides the interface for interacting with Casper's System Auction
//! contract to delegate/undelegate CSPR and manage staking rewards.
//!
//! IMPORTANT: The auction address must be verified on the target network before deployment.
//! - Testnet: hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2
//! - Mainnet: hash-ccb576d6ce6dec84a551e48f0d0b7af89ddba44c7390b690036257a04a3ae9ea
//!
//! The auction address is passed during contract initialization and stored in state.
//! This allows for network-agnostic deployment.

use odra::casper_types::{PublicKey, U512};
use odra::prelude::*;

// System Auction contract hash strings (for reference)
// IMPORTANT: Verify these hashes from Casper documentation before deployment

/// System Auction contract hash (TESTNET)
pub const AUCTION_HASH_TESTNET: &str =
    "hash-93d923e336b20a4c4ca14d592b60e5bd3fe330775618290104f9beb326db7ae2";

/// System Auction contract hash (MAINNET)
pub const AUCTION_HASH_MAINNET: &str =
    "hash-ccb576d6ce6dec84a551e48f0d0b7af89ddba44c7390b690036257a04a3ae9ea";

/// External contract interface for Casper System Auction
///
/// This trait defines the entry points available on the System Auction contract.
/// Use with Odra's external contract calling mechanism.
#[odra::external_contract]
pub trait SystemAuction {
    /// Delegate CSPR to a validator via System Auction
    ///
    /// # Arguments
    /// * `delegator` - Public key of the delegating entity (contract address)
    /// * `validator` - Public key of the validator to delegate to
    /// * `amount` - Amount of CSPR to delegate (in motes)
    ///
    /// # Cost
    /// Fixed cost of 2.5 CSPR
    fn delegate(&mut self, delegator: PublicKey, validator: PublicKey, amount: U512);

    /// Undelegate CSPR from a validator
    ///
    /// # Arguments
    /// * `delegator` - Public key of the delegating entity
    /// * `validator` - Public key of the validator to undelegate from
    /// * `amount` - Amount of CSPR to undelegate (in motes)
    ///
    /// # Note
    /// Unbonding takes 14 hours (1 era) on Casper 2.0
    fn undelegate(&mut self, delegator: PublicKey, validator: PublicKey, amount: U512);

    /// Get pending rewards for a delegator from a validator
    ///
    /// # Arguments
    /// * `delegator` - Public key of the delegator
    /// * `validator` - Public key of the validator
    ///
    /// # Returns
    /// Amount of pending rewards in motes
    fn get_delegator_reward(&self, delegator: PublicKey, validator: PublicKey) -> U512;

    /// Withdraw accumulated rewards from a validator
    ///
    /// # Arguments
    /// * `delegator` - Public key of the delegator
    /// * `validator` - Public key of the validator
    fn withdraw_delegator_reward(&mut self, delegator: PublicKey, validator: PublicKey);
}
