//! Unstake tests for Thaw liquid staking protocol

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};
use thaw::errors::Error;
use thaw::events::Unstaked;

use test_utils::*;

/// Helper to setup test environment with user having staked tokens
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

    // User stakes 100 CSPR
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    (env, thaw_core, thcspr_token, admin, treasury, user)
}

#[test]
fn test_unstake_full_balance() {
    // Stake 100 → unstake 100 → withdrawal created
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let thcspr_balance = thcspr_token.balance_of(user);
    let unstake_amount = U512::from(thcspr_balance.as_u128());

    let withdrawal_id = thaw_core.unstake(unstake_amount);

    // Verify withdrawal created
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id);
    assert!(withdrawal.is_some(), "Withdrawal should be created");

    let withdrawal = withdrawal.unwrap();
    assert_eq!(withdrawal.id, withdrawal_id);
    assert_eq!(withdrawal.user, user);
    assert_eq!(withdrawal.thcspr_burned, unstake_amount);
    assert!(!withdrawal.claimed);

    // Verify token burned
    let new_balance = thcspr_token.balance_of(user);
    assert_eq!(new_balance, 0u64.into(), "All tokens should be burned");

    // Verify pool state
    assert_eq!(thaw_core.get_total_pooled(), U512::zero());
    assert_eq!(thaw_core.get_total_supply(), U512::zero());
}

#[test]
fn test_unstake_partial() {
    // Stake 100 → unstake 50 → balance = 50
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let initial_balance = thcspr_token.balance_of(user);
    let unstake_amount = U512::from(50u64 * CSPR);

    thaw_core.unstake(unstake_amount);

    // Verify remaining balance
    let expected_remaining = U512::from(initial_balance.as_u128()) - unstake_amount;
    let new_balance = thcspr_token.balance_of(user);
    assert_eq!(new_balance, expected_remaining.as_u128().into());

    // Verify pool state
    assert_eq!(thaw_core.get_total_pooled(), expected_remaining);
    assert_eq!(thaw_core.get_total_supply(), expected_remaining);
}

#[test]
fn test_unstake_more_than_balance() {
    // Has 100 thCSPR → unstake 1000 → revert "Insufficient"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let unstake_amount = U512::from(1000u64 * CSPR); // Way more than balance

    let result = thaw_core.try_unstake(unstake_amount);

    assert!(result.is_err(), "Unstaking more than balance should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::InsufficientBalance.into(),
        "Should revert with InsufficientBalance error"
    );
}

#[test]
fn test_unstake_zero() {
    // Unstake 0 → revert "Amount must be > 0"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let result = thaw_core.try_unstake(U512::zero());

    assert!(result.is_err(), "Unstaking zero should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::AmountMustBePositive.into(),
        "Should revert with AmountMustBePositive error"
    );
}

#[test]
fn test_multiple_withdrawals() {
    // Create multiple withdrawals → all tracked correctly
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let unstake_amount = U512::from(20u64 * CSPR);

    // Create 5 withdrawals of 20 CSPR each
    let mut withdrawal_ids = Vec::new();
    for _ in 0..5 {
        let id = thaw_core.unstake(unstake_amount);
        withdrawal_ids.push(id);
    }

    // Verify all withdrawals exist
    for (i, &id) in withdrawal_ids.iter().enumerate() {
        let withdrawal = thaw_core.get_withdrawal(id);
        assert!(withdrawal.is_some(), "Withdrawal {} should exist", i);
        assert_eq!(withdrawal.unwrap().id, id);
    }

    // Verify user withdrawals list
    let user_withdrawals = thaw_core.get_user_withdrawals(user);
    assert_eq!(user_withdrawals.len(), 5, "User should have 5 withdrawals");

    // Verify all tokens are burned
    let balance = thcspr_token.balance_of(user);
    assert_eq!(balance, 0u64.into(), "All tokens should be burned");
}

#[test]
fn test_unstake_when_paused() {
    // Pause contract → unstake → revert "Contract is paused"
    let (env, mut thaw_core, _thcspr_token, admin, _treasury, user) = setup_with_stake();

    // Admin pauses contract
    env.set_caller(admin);
    thaw_core.pause();

    // User tries to unstake
    env.set_caller(user);
    let unstake_amount = U512::from(50u64 * CSPR);

    let result = thaw_core.try_unstake(unstake_amount);

    assert!(result.is_err(), "Unstaking when paused should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::ContractPaused.into(),
        "Should revert with ContractPaused error"
    );
}

#[test]
fn test_unstake_emits_event() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let unstake_amount = U512::from(50u64 * CSPR);
    let current_time = env.block_time();

    let withdrawal_id = thaw_core.unstake(unstake_amount);

    // Verify Unstaked event
    let expected_event = Unstaked {
        user,
        thcspr_burned: unstake_amount,
        cspr_amount: unstake_amount, // 1:1 rate
        withdrawal_id,
        claimable_timestamp: current_time + UNBONDING_PERIOD_MS,
    };

    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit Unstaked event"
    );
}

#[test]
fn test_unstake_calculates_cspr_correctly() {
    // At 1:1 rate, thCSPR burned = CSPR returned
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let unstake_amount = U512::from(50u64 * CSPR);

    let withdrawal_id = thaw_core.unstake(unstake_amount);

    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();

    // At 1:1 rate, CSPR amount should equal thCSPR burned
    assert_eq!(
        withdrawal.cspr_amount,
        withdrawal.thcspr_burned,
        "At 1:1 rate, CSPR should equal thCSPR"
    );
}

#[test]
fn test_unstake_sets_claimable_timestamp() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let current_time = env.block_time();
    let unstake_amount = U512::from(50u64 * CSPR);

    let withdrawal_id = thaw_core.unstake(unstake_amount);

    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();

    // Claimable timestamp should be current time + 14 hours
    let expected_claimable = current_time + UNBONDING_PERIOD_MS;
    assert_eq!(
        withdrawal.claimable_timestamp,
        expected_claimable,
        "Claimable timestamp should be 14 hours in the future"
    );
}

#[test]
fn test_withdrawal_counter_increments() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user) = setup_with_stake();

    env.set_caller(user);

    let unstake_amount = U512::from(10u64 * CSPR);

    let id1 = thaw_core.unstake(unstake_amount);
    let id2 = thaw_core.unstake(unstake_amount);
    let id3 = thaw_core.unstake(unstake_amount);

    // IDs should be sequential starting from 0
    assert_eq!(id1, 0);
    assert_eq!(id2, 1);
    assert_eq!(id3, 2);
}

#[test]
fn test_unstake_user_without_tokens() {
    // User with no tokens tries to unstake
    let env = odra_test::env();

    let admin = env.get_account(0);
    let treasury = env.get_account(1);
    let user_without_tokens = env.get_account(5);

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

    // User without tokens tries to unstake
    env.set_caller(user_without_tokens);

    let result = thaw_core.try_unstake(U512::from(10u64 * CSPR));

    assert!(result.is_err(), "User without tokens should fail to unstake");
    assert_eq!(
        result.unwrap_err(),
        Error::InsufficientBalance.into(),
        "Should revert with InsufficientBalance"
    );
}
