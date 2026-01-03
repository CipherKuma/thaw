//! Thaw - Liquid Staking Protocol for Casper Network
//!
//! This crate provides a liquid staking solution where users can:
//! - Stake CSPR and receive thCSPR (liquid staking token)
//! - Unstake thCSPR to receive CSPR after unbonding period
//! - Earn staking rewards through auto-compounding
//! - Use leveraged staking for amplified yields

#![no_std]

extern crate alloc;

pub mod auction_interface;
pub mod errors;
pub mod events;
pub mod lending_pool;
pub mod thcspr_token;
pub mod thaw_core;

// Re-export main types for external use
pub use errors::*;
pub use events::*;
pub use lending_pool::LendingPool;
pub use thcspr_token::ThCsprToken;
pub use thaw_core::{ThawCore, WithdrawalRequest};

// Re-export generated types only when not building for wasm32 target
#[cfg(not(target_arch = "wasm32"))]
pub use lending_pool::{LendingPoolHostRef, LendingPoolInitArgs};
#[cfg(not(target_arch = "wasm32"))]
pub use thcspr_token::{ThCsprTokenHostRef, ThCsprTokenInitArgs};
#[cfg(not(target_arch = "wasm32"))]
pub use thaw_core::{ThawCoreHostRef, ThawCoreInitArgs};
