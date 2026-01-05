//! Integration tests for Thaw liquid staking protocol
//!
//! These tests cover full user flows and multi-step scenarios.

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};

use test_utils::*;

/// Helper to setup fresh test environment
fn setup() -> (HostEnv, ThawCoreHostRef, ThCsprTokenHostRef, Address, Address, Address, Address) {
    let env = odra_test::env();

    let admin = env.get_account(0);
    let treasury = env.get_account(1);
    let user1 = env.get_account(2);
    let user2 = env.get_account(3);

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

    (env, thaw_core, thcspr_token, admin, treasury, user1, user2)
}

#[test]
fn test_full_stake_unstake_claim_flow() {
    // 1. User stakes 100 CSPR
    // 2. Receives 100 thCSPR
    // 3. Unstakes all
    // 4. Wait 14h
    // 5. Claims successfully
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user, _user2) = setup();

    // 1. User stakes 100 CSPR
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    // 2. Receives 100 thCSPR (1:1 rate on initial stake)
    assert_eq!(thcspr_received, stake_amount, "Should receive 1:1 thCSPR");
    let balance = thcspr_token.balance_of(user);
    assert_eq!(balance, stake_amount.as_u128().into());

    // 3. Unstakes all
    let withdrawal_id = thaw_core.unstake(stake_amount);

    // Verify token burned
    let balance_after_unstake = thcspr_token.balance_of(user);
    assert_eq!(balance_after_unstake, 0u64.into(), "All thCSPR should be burned");

    // Verify withdrawal created
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();
    assert_eq!(withdrawal.user, user);
    assert!(!withdrawal.claimed);

    // 4. Wait 14h
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // 5. Claims successfully
    let claimed_amount = thaw_core.claim(withdrawal_id);
    assert_eq!(claimed_amount, stake_amount, "Should claim full stake amount");

    // Verify withdrawal marked as claimed
    let withdrawal_after = thaw_core.get_withdrawal(withdrawal_id).unwrap();
    assert!(withdrawal_after.claimed);
}

#[test]
fn test_multiple_users_stake_and_unstake() {
    // Multiple users interact with the protocol
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user1, user2) = setup();

    // User 1 stakes 100 CSPR
    env.set_caller(user1);
    let stake1 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake1).stake();

    // User 2 stakes 200 CSPR
    env.set_caller(user2);
    let stake2 = U512::from(200u64 * CSPR);
    thaw_core.with_tokens(stake2).stake();

    // Verify total pooled
    let expected_total = stake1 + stake2;
    assert_eq!(thaw_core.get_total_pooled(), expected_total);
    assert_eq!(thaw_core.get_total_supply(), expected_total);

    // Verify individual balances
    assert_eq!(thcspr_token.balance_of(user1), stake1.as_u128().into());
    assert_eq!(thcspr_token.balance_of(user2), stake2.as_u128().into());

    // User 1 unstakes half
    env.set_caller(user1);
    let unstake1 = U512::from(50u64 * CSPR);
    let withdrawal_id1 = thaw_core.unstake(unstake1);

    // User 2 unstakes all
    env.set_caller(user2);
    let withdrawal_id2 = thaw_core.unstake(stake2);

    // Wait for unbonding
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // Both users claim
    env.set_caller(user1);
    thaw_core.claim(withdrawal_id1);

    env.set_caller(user2);
    thaw_core.claim(withdrawal_id2);

    // Verify final state
    let remaining = stake1 - unstake1;
    assert_eq!(thaw_core.get_total_pooled(), remaining);
    assert_eq!(thcspr_token.balance_of(user1), remaining.as_u128().into());
    assert_eq!(thcspr_token.balance_of(user2), 0u64.into());
}

#[test]
fn test_first_deposit_exchange_rate() {
    // First deposit always 1:1
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, _user2) = setup();

    // Initial exchange rate should be 1e18 (1:1)
    let initial_rate = thaw_core.get_exchange_rate();
    assert_eq!(initial_rate, U512::from(EXCHANGE_RATE_PRECISION));

    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    // First stake should be 1:1
    assert_eq!(thcspr_received, stake_amount);

    // Exchange rate should still be 1:1 after first stake
    let rate_after = thaw_core.get_exchange_rate();
    assert_eq!(rate_after, U512::from(EXCHANGE_RATE_PRECISION));
}

#[test]
fn test_empty_pool_after_full_withdraw() {
    // All users withdraw → totals = 0 → next deposit is 1:1
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user, _user2) = setup();

    // User stakes
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    // User unstakes everything
    let withdrawal_id = thaw_core.unstake(stake_amount);

    // Verify pool is empty
    assert_eq!(thaw_core.get_total_pooled(), U512::zero());
    assert_eq!(thaw_core.get_total_supply(), U512::zero());

    // Wait and claim
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);
    thaw_core.claim(withdrawal_id);

    // Exchange rate should reset to 1:1 for empty pool
    let rate = thaw_core.get_exchange_rate();
    assert_eq!(rate, U512::from(EXCHANGE_RATE_PRECISION), "Empty pool should have 1:1 rate");

    // New user's deposit should be 1:1
    let user3 = env.get_account(4);
    env.set_caller(user3);
    let new_stake = U512::from(50u64 * CSPR);
    let thcspr_received = thaw_core.with_tokens(new_stake).stake();
    assert_eq!(thcspr_received, new_stake, "New deposit after empty should be 1:1");
}

#[test]
fn test_partial_unstake_flow() {
    // User partially unstakes multiple times
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user, _user2) = setup();

    // User stakes 100 CSPR
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    // Unstake 30
    let unstake1 = U512::from(30u64 * CSPR);
    let _w1 = thaw_core.unstake(unstake1);

    // Check balance
    assert_eq!(thcspr_token.balance_of(user), U512::from(70u64 * CSPR).as_u128().into());

    // Unstake another 20
    let unstake2 = U512::from(20u64 * CSPR);
    let _w2 = thaw_core.unstake(unstake2);

    // Check balance
    assert_eq!(thcspr_token.balance_of(user), U512::from(50u64 * CSPR).as_u128().into());

    // Verify user has 2 withdrawals
    let user_withdrawals = thaw_core.get_user_withdrawals(user);
    assert_eq!(user_withdrawals.len(), 2, "User should have 2 withdrawals");

    // Verify pool state
    assert_eq!(thaw_core.get_total_pooled(), U512::from(50u64 * CSPR));
}

#[test]
fn test_token_transfer_flow() {
    // User stakes, transfers tokens, recipient unstakes
    let (env, mut thaw_core, mut thcspr_token, _admin, _treasury, user1, user2) = setup();

    // User 1 stakes
    env.set_caller(user1);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    // User 1 transfers half to user 2
    let transfer_amount = U512::from(50u64 * CSPR);
    thcspr_token.transfer(user2, transfer_amount.as_u128().into());

    // Verify balances
    assert_eq!(thcspr_token.balance_of(user1), transfer_amount.as_u128().into());
    assert_eq!(thcspr_token.balance_of(user2), transfer_amount.as_u128().into());

    // User 2 can unstake
    env.set_caller(user2);
    let result = thaw_core.try_unstake(transfer_amount);
    assert!(result.is_ok(), "Recipient should be able to unstake transferred tokens");

    // Verify user 2's balance after unstake
    assert_eq!(thcspr_token.balance_of(user2), 0u64.into());
}

#[test]
fn test_stake_unstake_during_unbonding() {
    // User can stake new tokens while having pending withdrawals
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user, _user2) = setup();

    env.set_caller(user);

    // Initial stake
    let stake1 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake1).stake();

    // Unstake half
    let unstake = U512::from(50u64 * CSPR);
    let _withdrawal_id = thaw_core.unstake(unstake);

    // Stake more while withdrawal is pending
    let stake2 = U512::from(30u64 * CSPR);
    let result = thaw_core.with_tokens(stake2).try_stake();
    assert!(result.is_ok(), "Should be able to stake while withdrawal is pending");

    // Check balance: 50 (remaining) + 30 (new) = 80
    let expected_balance = U512::from(80u64 * CSPR);
    assert_eq!(thcspr_token.balance_of(user), expected_balance.as_u128().into());
}

#[test]
fn test_compound_between_user_actions() {
    // Compound is called between user actions
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user1, user2) = setup();

    // User 1 stakes
    env.set_caller(user1);
    let stake1 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake1).stake();

    // Compound (with mock auction, no actual rewards)
    let compound_result = thaw_core.compound();
    assert_eq!(compound_result, U512::zero(), "No rewards from mock auction");

    // User 2 stakes
    env.set_caller(user2);
    let stake2 = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake2).stake();

    // Total should be sum of both stakes (no rewards added)
    let expected_total = stake1 + stake2;
    assert_eq!(thaw_core.get_total_pooled(), expected_total);
}

#[test]
fn test_admin_pause_during_active_withdrawals() {
    // Admin pauses while users have active withdrawals
    // Users should still be able to claim after unbonding
    let (env, mut thaw_core, _thcspr_token, admin, _treasury, user, _user2) = setup();

    // User stakes and unstakes
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();
    let withdrawal_id = thaw_core.unstake(stake_amount);

    // Admin pauses
    env.set_caller(admin);
    thaw_core.pause();

    // Advance time past unbonding
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // User should still be able to claim
    env.set_caller(user);
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Claim should work even when paused");
}

#[test]
fn test_view_functions() {
    // Test all view functions work correctly
    let (env, mut thaw_core, _thcspr_token, admin, treasury, user, _user2) = setup();

    // Initial state checks
    assert_eq!(thaw_core.get_total_pooled(), U512::zero());
    assert_eq!(thaw_core.get_total_supply(), U512::zero());
    assert_eq!(thaw_core.get_exchange_rate(), U512::from(EXCHANGE_RATE_PRECISION));
    assert_eq!(thaw_core.get_min_stake(), U512::from(MIN_STAKE));
    assert_eq!(thaw_core.get_protocol_fee_bps(), 1000); // 10%
    assert!(!thaw_core.is_paused());
    assert_eq!(thaw_core.get_admin(), Some(admin));
    assert_eq!(thaw_core.get_treasury(), Some(treasury));
    assert!(thaw_core.get_validator().is_some());
    assert!(thaw_core.get_auction().is_some());

    // User stakes
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    // After stake checks
    assert_eq!(thaw_core.get_total_pooled(), stake_amount);
    assert_eq!(thaw_core.get_total_supply(), stake_amount);

    // User creates withdrawal
    let unstake_amount = U512::from(50u64 * CSPR);
    let withdrawal_id = thaw_core.unstake(unstake_amount);

    // Withdrawal view
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id);
    assert!(withdrawal.is_some());
    let w = withdrawal.unwrap();
    assert_eq!(w.user, user);
    assert!(!w.claimed);

    // User withdrawals view
    let user_withdrawals = thaw_core.get_user_withdrawals(user);
    assert_eq!(user_withdrawals.len(), 1);
}

#[test]
fn test_concurrent_operations_same_block() {
    // Multiple operations in the same block
    let (env, mut thaw_core, thcspr_token, _admin, _treasury, user1, user2) = setup();

    // User 1 stakes
    env.set_caller(user1);
    thaw_core.with_tokens(U512::from(100u64 * CSPR)).stake();

    // User 2 stakes in same block
    env.set_caller(user2);
    thaw_core.with_tokens(U512::from(100u64 * CSPR)).stake();

    // User 1 unstakes in same block
    env.set_caller(user1);
    thaw_core.unstake(U512::from(50u64 * CSPR));

    // All operations should be processed correctly
    assert_eq!(thaw_core.get_total_pooled(), U512::from(150u64 * CSPR));
    assert_eq!(thcspr_token.balance_of(user1), U512::from(50u64 * CSPR).as_u128().into());
    assert_eq!(thcspr_token.balance_of(user2), U512::from(100u64 * CSPR).as_u128().into());
}

#[test]
fn test_exchange_rate_precision() {
    // Test that exchange rate maintains precision
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, _user2) = setup();

    env.set_caller(user);

    // Stake an odd amount
    let stake_amount = U512::from(123_456_789_012u64); // ~123 CSPR with extra motes
    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();

    // At 1:1 rate, should receive exact same amount
    assert_eq!(thcspr_received, stake_amount, "Should maintain precision at 1:1 rate");

    // Exchange rate should still be 1e18
    let rate = thaw_core.get_exchange_rate();
    assert_eq!(rate, U512::from(EXCHANGE_RATE_PRECISION));
}

#[test]
fn test_full_cycle_multiple_times() {
    // User goes through full stake-unstake-claim cycle multiple times
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, _user2) = setup();

    env.set_caller(user);

    for i in 0..3 {
        // Stake
        let stake_amount = U512::from((50 + i * 10) as u64 * CSPR);
        thaw_core.with_tokens(stake_amount).stake();

        // Unstake
        let withdrawal_id = thaw_core.unstake(stake_amount);

        // Wait and claim
        env.advance_block_time(UNBONDING_PERIOD_MS + 1);
        thaw_core.claim(withdrawal_id);
    }

    // Pool should be empty after all withdrawals
    assert_eq!(thaw_core.get_total_pooled(), U512::zero());
    assert_eq!(thaw_core.get_total_supply(), U512::zero());
}
