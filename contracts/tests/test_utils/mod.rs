//! Test utilities and helpers for Thaw protocol tests

pub mod mock_auction;

pub use mock_auction::{MockAuction, MockAuctionHostRef};

use odra::casper_types::{PublicKey, SecretKey, U512};
use odra::host::{Deployer, HostEnv, NoArgs};
use odra::prelude::*;

/// Constants for testing
pub const CSPR: u64 = 1_000_000_000; // 1 CSPR in motes (9 decimals)
pub const MIN_STAKE: u64 = 10 * CSPR; // 10 CSPR minimum stake
pub const UNBONDING_PERIOD_MS: u64 = 14 * 60 * 60 * 1000; // 14 hours
pub const EXCHANGE_RATE_PRECISION: u128 = 1_000_000_000_000_000_000; // 1e18

/// Create a mock validator public key for testing
pub fn create_mock_validator_key() -> PublicKey {
    // Create a deterministic secret key for testing
    let secret_key = SecretKey::ed25519_from_bytes([1u8; 32]).unwrap();
    PublicKey::from(&secret_key)
}

/// Helper to convert U512 to u128 for easier assertions
pub fn to_u128(value: U512) -> u128 {
    value.as_u128()
}

/// Helper to check if exchange rate is approximately equal (within tolerance)
pub fn exchange_rate_approx_eq(actual: U512, expected: U512, tolerance_pct: u64) -> bool {
    let tolerance = expected * U512::from(tolerance_pct) / U512::from(100u64);
    let diff = if actual > expected {
        actual - expected
    } else {
        expected - actual
    };
    diff <= tolerance
}

/// Deploy a mock auction contract for testing
pub fn deploy_mock_auction(env: &HostEnv) -> MockAuctionHostRef {
    MockAuction::deploy(env, NoArgs)
}
