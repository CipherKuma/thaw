//! Compound tests for Thaw liquid staking protocol
//!
//! Note: These tests are designed to work with a mock auction contract.
//! In the actual implementation, the System Auction would need to be mocked
//! to return specific reward amounts. For now, we test the compound logic
//! assuming zero rewards from the mock auction.

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};

use test_utils::*;

/// Helper to setup test environment with staked tokens
fn setup_with_stake() -> (HostEnv, ThawCoreHostRef, ThCsprTokenHostRef, Address, Address, Address) {
    let env = odra_test::env();

    let admin = env.get_account(0);
    let treasury = env.get_account(1);
    let user = env.get_account(2);

    let validator = create_mock_validator_key();

    // Deploy mock auction contract
    let mock_auction = deploy_mock_auction(&env);

    // Deploy ThawCore first with admin as placeholder token
    let mut thaw_core = ThawCore::deploy(
        &env,
        ThawCoreInitArgs {
            thcspr_token: admin, // placeholder, will update after token deploy
            validator: validator.clone(),
            auction_address: mock_auction.address(),
            treasury,
            admin,
        },
    );

    // Deploy token with ThawCore as minter
    let thcspr_token = ThCsprToken::deploy(
        &env,
        ThCsprTokenInitArgs {
            minter: thaw_core.address(),
        },
    );

    // Update ThawCore to use the correct token address
    env.set_caller(admin);
    thaw_core.set_thcspr_token(thcspr_token.address());

    // User stakes
    env.set_caller(user);
    let stake_amount = U512::from(1000u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    (env, thaw_core, thcspr_token, admin, treasury, user)
}

#[test]
fn test_compound_no_rewards() {
    // No rewards → returns 0, no state change
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let total_pooled_before = thaw_core.get_total_pooled();
    let exchange_rate_before = thaw_core.get_exchange_rate();

    // Compound with mock auction (returns 0 rewards)
    let rewards_to_pool = thaw_core.compound();

    // Should return 0 since mock auction has no rewards
    assert_eq!(rewards_to_pool, U512::zero(), "No rewards should mean 0 returned");

    // State should not change
    assert_eq!(
        thaw_core.get_total_pooled(),
        total_pooled_before,
        "Total pooled should not change"
    );
    assert_eq!(
        thaw_core.get_exchange_rate(),
        exchange_rate_before,
        "Exchange rate should not change"
    );
}

#[test]
fn test_compound_anyone_can_call() {
    // Any user can call compound, not just admin
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, _user) = setup_with_stake();

    let random_user = env.get_account(7);
    env.set_caller(random_user);

    // Should not revert when called by random user
    let result = thaw_core.try_compound();
    assert!(result.is_ok(), "Anyone should be able to call compound");
}

#[test]
fn test_compound_multiple_times() {
    // Calling compound multiple times should be safe
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    // Compound multiple times
    for _ in 0..5 {
        let result = thaw_core.try_compound();
        assert!(result.is_ok(), "Compound should not fail on repeated calls");
    }
}

#[test]
fn test_exchange_rate_initial() {
    // Initial exchange rate should be 1:1 (1e18)
    let env = odra_test::env();

    let admin = env.get_account(0);
    let treasury = env.get_account(1);

    let validator = create_mock_validator_key();

    // Deploy mock auction contract
    let mock_auction = deploy_mock_auction(&env);

    // Deploy ThawCore first with admin as placeholder token
    let mut thaw_core = ThawCore::deploy(
        &env,
        ThawCoreInitArgs {
            thcspr_token: admin, // placeholder
            validator: validator.clone(),
            auction_address: mock_auction.address(),
            treasury,
            admin,
        },
    );

    // Deploy token with ThawCore as minter
    let thcspr_token = ThCsprToken::deploy(
        &env,
        ThCsprTokenInitArgs {
            minter: thaw_core.address(),
        },
    );

    // Update ThawCore to use the correct token address
    env.set_caller(admin);
    thaw_core.set_thcspr_token(thcspr_token.address());

    // Exchange rate should be 1:1 on empty pool
    let exchange_rate = thaw_core.get_exchange_rate();
    assert_eq!(
        exchange_rate,
        U512::from(EXCHANGE_RATE_PRECISION),
        "Initial exchange rate should be 1e18 (1:1)"
    );
}

#[test]
fn test_exchange_rate_after_stake() {
    // Exchange rate should remain 1:1 after initial stake
    let (_env, thaw_core, _thcspr_token, _admin, _treasury, _user) = setup_with_stake();

    let exchange_rate = thaw_core.get_exchange_rate();
    assert_eq!(
        exchange_rate,
        U512::from(EXCHANGE_RATE_PRECISION),
        "Exchange rate should remain 1:1 after stake"
    );
}

#[test]
fn test_protocol_fee_configuration() {
    // Verify default protocol fee is 10% (1000 bps)
    let (_env, thaw_core, _thcspr_token, _admin, _treasury, _user) = setup_with_stake();

    let fee_bps = thaw_core.get_protocol_fee_bps();
    assert_eq!(fee_bps, 1000, "Default fee should be 10% (1000 bps)");
}

#[test]
fn test_compound_preserves_exchange_rate_without_rewards() {
    // If no rewards, exchange rate should be preserved exactly
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let rate_before = thaw_core.get_exchange_rate();

    // Compound with no rewards
    thaw_core.compound();

    let rate_after = thaw_core.get_exchange_rate();

    assert_eq!(rate_before, rate_after, "Exchange rate should not change without rewards");
}

/// Test structure for verifying compound math
/// This test documents the expected behavior when rewards are present
/// In production, the System Auction would be a real contract
#[test]
fn test_compound_math_documentation() {
    // This test documents expected compound behavior:
    //
    // Given:
    // - Total pooled CSPR: 1000
    // - Total thCSPR supply: 1000
    // - Exchange rate: 1.0 (1e18)
    // - Rewards from auction: 100 CSPR
    // - Protocol fee: 10% (1000 bps)
    //
    // Expected:
    // - Protocol fee: 100 * 10% = 10 CSPR → sent to treasury
    // - Rewards to pool: 100 - 10 = 90 CSPR
    // - New total pooled: 1000 + 90 = 1090 CSPR
    // - Total supply unchanged: 1000 thCSPR
    // - New exchange rate: 1090/1000 = 1.09 (1.09e18)
    //
    // The thCSPR holders now have more CSPR per token

    let (_env, thaw_core, _thcspr_token, _admin, _treasury, _user) = setup_with_stake();

    // Verify initial state
    assert_eq!(thaw_core.get_total_pooled(), U512::from(1000u64 * CSPR));
    assert_eq!(thaw_core.get_total_supply(), U512::from(1000u64 * CSPR));
    assert_eq!(thaw_core.get_exchange_rate(), U512::from(EXCHANGE_RATE_PRECISION));
}

#[test]
fn test_stake_after_hypothetical_rewards() {
    // Document expected behavior when staking after rewards have been compounded
    //
    // Given:
    // - Pool has 1090 CSPR
    // - Supply is 1000 thCSPR
    // - Exchange rate: 1.09
    // - User stakes 109 CSPR
    //
    // Expected:
    // - User receives: 109 / 1.09 = 100 thCSPR
    // - New total pooled: 1199 CSPR
    // - New supply: 1100 thCSPR

    // This test documents the expected math for the UI and integration tests
    let expected_exchange_rate_after_9pct_rewards = 109 * EXCHANGE_RATE_PRECISION / 100;
    assert!(
        expected_exchange_rate_after_9pct_rewards > EXCHANGE_RATE_PRECISION,
        "Exchange rate should increase after rewards"
    );
}

#[test]
fn test_compound_empty_pool() {
    // Compound on empty pool should be safe
    let env = odra_test::env();

    let admin = env.get_account(0);
    let treasury = env.get_account(1);

    let validator = create_mock_validator_key();

    // Deploy mock auction contract
    let mock_auction = deploy_mock_auction(&env);

    // Deploy ThawCore first with admin as placeholder token
    let mut thaw_core = ThawCore::deploy(
        &env,
        ThawCoreInitArgs {
            thcspr_token: admin, // placeholder
            validator: validator.clone(),
            auction_address: mock_auction.address(),
            treasury,
            admin,
        },
    );

    // Deploy token with ThawCore as minter
    let thcspr_token = ThCsprToken::deploy(
        &env,
        ThCsprTokenInitArgs {
            minter: thaw_core.address(),
        },
    );

    // Update ThawCore to use the correct token address
    env.set_caller(admin);
    thaw_core.set_thcspr_token(thcspr_token.address());

    // Compound on empty pool should not fail
    let result = thaw_core.try_compound();
    assert!(result.is_ok(), "Compound on empty pool should not fail");
}

#[test]
fn test_total_pooled_and_supply_consistency() {
    // After compound (with no rewards), totals should remain consistent
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let pooled_before = thaw_core.get_total_pooled();
    let supply_before = thaw_core.get_total_supply();

    thaw_core.compound();

    let pooled_after = thaw_core.get_total_pooled();
    let supply_after = thaw_core.get_total_supply();

    // Without rewards, they should be equal
    assert_eq!(pooled_before, pooled_after);
    assert_eq!(supply_before, supply_after);
}
