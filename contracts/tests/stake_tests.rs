//! Stake tests for Thaw liquid staking protocol

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};
use thaw::errors::Error;
use thaw::events::Staked;

use test_utils::*;

/// Helper to setup test environment with properly linked contracts
fn setup() -> (HostEnv, ThawCoreHostRef, ThCsprTokenHostRef, Address, Address, Address) {
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

    (env, thaw_core, thcspr_token, admin, treasury, user)
}

#[test]
fn test_stake_minimum() {
    // Stake exactly 10 CSPR → receive 10 thCSPR (1:1 initial)
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let stake_amount = U512::from(10u64 * CSPR);

    // Stake with attached value
    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    // Should receive 1:1 on first stake
    assert_eq!(thcspr_received, stake_amount, "Should receive 1:1 thCSPR on initial stake");

    // Verify token balance
    let balance = thcspr_token.balance_of(user);
    assert_eq!(balance, stake_amount.as_u128().into(), "Token balance should match");

    // Verify pool state
    assert_eq!(thaw_core.get_total_pooled(), stake_amount);
    assert_eq!(thaw_core.get_total_supply(), stake_amount);
}

#[test]
fn test_stake_below_minimum() {
    // Stake 5 CSPR → revert "Below minimum"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let stake_amount = U512::from(5u64 * CSPR); // Below 10 CSPR minimum

    // Should revert with BelowMinimumStake error
    let result = thaw_core.with_tokens(stake_amount).try_stake();

    assert!(result.is_err(), "Staking below minimum should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::BelowMinimumStake.into(),
        "Should revert with BelowMinimumStake error"
    );
}

#[test]
fn test_stake_when_paused() {
    // Pause contract → stake → revert "Contract is paused"
    let (env, mut thaw_core, _thcspr_token, admin, _treasury, user) = setup();

    // Admin pauses contract
    env.set_caller(admin);
    thaw_core.pause();

    // User tries to stake
    env.set_caller(user);
    let stake_amount = U512::from(10u64 * CSPR);

    let result = thaw_core.with_tokens(stake_amount).try_stake();

    assert!(result.is_err(), "Staking when paused should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::ContractPaused.into(),
        "Should revert with ContractPaused error"
    );
}

#[test]
fn test_stake_updates_totals() {
    // Stake 100 CSPR → total_pooled = 100, total_supply = 100
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let stake_amount = U512::from(100u64 * CSPR);

    thaw_core.with_tokens(stake_amount).stake();

    assert_eq!(
        thaw_core.get_total_pooled(),
        stake_amount,
        "Total pooled should equal staked amount"
    );
    assert_eq!(
        thaw_core.get_total_supply(),
        stake_amount,
        "Total supply should equal staked amount"
    );
}

#[test]
fn test_stake_multiple_users() {
    // Multiple users stake, totals accumulate correctly
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, _user) = setup();

    let user1 = env.get_account(2);
    let user2 = env.get_account(3);

    // User1 stakes 100 CSPR
    env.set_caller(user1);
    let stake1 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake1).stake();

    // User2 stakes 50 CSPR
    env.set_caller(user2);
    let stake2 = U512::from(50u64 * CSPR);
    thaw_core.with_tokens(stake2).stake();

    // Check totals
    let expected_total = stake1 + stake2;
    assert_eq!(thaw_core.get_total_pooled(), expected_total);
    assert_eq!(thaw_core.get_total_supply(), expected_total);

    // Check individual balances
    let balance1 = thcspr_token.balance_of(user1);
    let balance2 = thcspr_token.balance_of(user2);
    assert_eq!(balance1, stake1.as_u128().into());
    assert_eq!(balance2, stake2.as_u128().into());
}

#[test]
fn test_stake_emits_event() {
    // Verify Staked event is emitted
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);

    thaw_core.with_tokens(stake_amount).stake();

    // Verify Staked event was emitted
    let expected_event = Staked {
        user,
        cspr_amount: stake_amount,
        thcspr_minted: stake_amount, // 1:1 on first stake
        exchange_rate: U512::from(EXCHANGE_RATE_PRECISION), // 1e18 = 1:1 rate
    };

    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit Staked event"
    );
}

#[test]
fn test_first_deposit_exchange_rate() {
    // First deposit always 1:1
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    // Initial exchange rate should be 1:1 (1e18)
    let initial_rate = thaw_core.get_exchange_rate();
    assert_eq!(
        initial_rate,
        U512::from(EXCHANGE_RATE_PRECISION),
        "Initial exchange rate should be 1:1"
    );

    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    // First stake should be 1:1
    assert_eq!(thcspr_received, stake_amount, "First stake should be 1:1");
}

#[test]
fn test_stake_large_amount() {
    // Test staking a large amount (1 million CSPR)
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let stake_amount = U512::from(1_000_000u64 * CSPR);

    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    assert_eq!(thcspr_received, stake_amount);
    assert_eq!(thaw_core.get_total_pooled(), stake_amount);

    let balance = thcspr_token.balance_of(user);
    assert_eq!(balance, stake_amount.as_u128().into());
}

#[test]
fn test_stake_exactly_minimum() {
    // Stake exactly at minimum boundary
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let min_stake = thaw_core.get_min_stake();

    // Should succeed at exactly minimum
    let result = thaw_core.with_tokens(min_stake).try_stake();
    assert!(result.is_ok(), "Staking exactly minimum should succeed");
}

#[test]
fn test_stake_just_below_minimum() {
    // Stake 1 mote below minimum
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    let min_stake = thaw_core.get_min_stake();
    let below_min = min_stake - U512::one();

    // Should fail just below minimum
    let result = thaw_core.with_tokens(below_min).try_stake();
    assert!(result.is_err(), "Staking below minimum should fail");
}

#[test]
fn test_consecutive_stakes_same_user() {
    // Same user stakes multiple times
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup();

    env.set_caller(user);

    // First stake
    let stake1 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake1).stake();

    // Second stake
    let stake2 = U512::from(50u64 * CSPR);
    thaw_core.with_tokens(stake2).stake();

    // Third stake
    let stake3 = U512::from(25u64 * CSPR);
    thaw_core.with_tokens(stake3).stake();

    // Check total balance
    let expected_total = stake1 + stake2 + stake3;
    let balance = thcspr_token.balance_of(user);
    assert_eq!(balance, expected_total.as_u128().into());

    // Check pool state
    assert_eq!(thaw_core.get_total_pooled(), expected_total);
    assert_eq!(thaw_core.get_total_supply(), expected_total);
}
