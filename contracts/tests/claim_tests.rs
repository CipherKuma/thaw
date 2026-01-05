//! Claim tests for Thaw liquid staking protocol

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};
use thaw::errors::Error;
use thaw::events::Claimed;

use test_utils::*;

/// Helper to setup test environment with user having an active withdrawal
fn setup_with_withdrawal() -> (HostEnv, ThawCoreHostRef, ThCsprTokenHostRef, Address, Address, Address, u64) {
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

    // User stakes and unstakes
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    thaw_core.with_tokens(stake_amount).stake();

    let unstake_amount = U512::from(50u64 * CSPR);
    let withdrawal_id = thaw_core.unstake(unstake_amount);

    (env, thaw_core, thcspr_token, admin, treasury, user, withdrawal_id)
}

#[test]
fn test_claim_before_unbonding() {
    // Claim immediately → revert "Still unbonding"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Try to claim immediately (before 14h unbonding period)
    let result = thaw_core.try_claim(withdrawal_id);

    assert!(result.is_err(), "Claiming before unbonding should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::StillUnbonding.into(),
        "Should revert with StillUnbonding error"
    );
}

#[test]
fn test_claim_after_unbonding() {
    // Wait 14h → claim → success, CSPR transferred
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Advance time past unbonding period
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // Claim should succeed
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Claiming after unbonding should succeed");

    // Verify withdrawal is marked as claimed
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();
    assert!(withdrawal.claimed, "Withdrawal should be marked as claimed");
}

#[test]
fn test_claim_not_owner() {
    // User B tries to claim User A's withdrawal → revert
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    let other_user = env.get_account(5);

    // Advance time past unbonding period
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // Other user tries to claim
    env.set_caller(other_user);
    let result = thaw_core.try_claim(withdrawal_id);

    assert!(result.is_err(), "Non-owner should not be able to claim");
    assert_eq!(
        result.unwrap_err(),
        Error::NotWithdrawalOwner.into(),
        "Should revert with NotWithdrawalOwner error"
    );

    // Original user should still be able to claim
    env.set_caller(user);
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Original owner should be able to claim");
}

#[test]
fn test_double_claim() {
    // Claim twice → second reverts "Already claimed"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Advance time past unbonding period
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // First claim should succeed
    let result1 = thaw_core.try_claim(withdrawal_id);
    assert!(result1.is_ok(), "First claim should succeed");

    // Second claim should fail
    let result2 = thaw_core.try_claim(withdrawal_id);
    assert!(result2.is_err(), "Second claim should fail");
    assert_eq!(
        result2.unwrap_err(),
        Error::AlreadyClaimed.into(),
        "Should revert with AlreadyClaimed error"
    );
}

#[test]
fn test_claim_nonexistent() {
    // Claim invalid ID → revert "Withdrawal not found"
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, _withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Try to claim a nonexistent withdrawal
    let invalid_id = 999999u64;
    let result = thaw_core.try_claim(invalid_id);

    assert!(result.is_err(), "Claiming nonexistent withdrawal should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::WithdrawalNotFound.into(),
        "Should revert with WithdrawalNotFound error"
    );
}

#[test]
fn test_claim_returns_correct_amount() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Get expected amount before claiming
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();
    let expected_amount = withdrawal.cspr_amount;

    // Advance time and claim
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);
    let claimed_amount = thaw_core.claim(withdrawal_id);

    assert_eq!(claimed_amount, expected_amount, "Claimed amount should match withdrawal amount");
}

#[test]
fn test_claim_emits_event() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Get expected amount
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id).unwrap();
    let expected_amount = withdrawal.cspr_amount;

    // Advance time and claim
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);
    thaw_core.claim(withdrawal_id);

    // Verify Claimed event
    let expected_event = Claimed {
        user,
        withdrawal_id,
        cspr_amount: expected_amount,
    };

    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit Claimed event"
    );
}

#[test]
fn test_claim_exactly_at_unbonding_end() {
    // Claim exactly when unbonding period ends
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Advance time to exactly the unbonding end
    env.advance_block_time(UNBONDING_PERIOD_MS);

    // Should succeed exactly at unbonding end
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Claiming exactly at unbonding end should succeed");
}

#[test]
fn test_claim_one_ms_before_unbonding() {
    // Claim 1ms before unbonding ends → should fail
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Advance time to 1ms before unbonding ends
    env.advance_block_time(UNBONDING_PERIOD_MS - 1);

    // Should fail 1ms before
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_err(), "Claiming 1ms before unbonding end should fail");
    assert_eq!(result.unwrap_err(), Error::StillUnbonding.into());
}

#[test]
fn test_claim_multiple_withdrawals() {
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id1) = setup_with_withdrawal();

    env.set_caller(user);

    // Create second withdrawal
    let unstake_amount = U512::from(25u64 * CSPR);
    let withdrawal_id2 = thaw_core.unstake(unstake_amount);

    // Advance time past unbonding
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // Claim first withdrawal
    let result1 = thaw_core.try_claim(withdrawal_id1);
    assert!(result1.is_ok(), "First claim should succeed");

    // Claim second withdrawal
    let result2 = thaw_core.try_claim(withdrawal_id2);
    assert!(result2.is_ok(), "Second claim should succeed");

    // Both should be marked as claimed
    let w1 = thaw_core.get_withdrawal(withdrawal_id1).unwrap();
    let w2 = thaw_core.get_withdrawal(withdrawal_id2).unwrap();
    assert!(w1.claimed);
    assert!(w2.claimed);
}

#[test]
fn test_claim_works_when_paused() {
    // Claim should work even when contract is paused
    let (env, mut thaw_core, _thcspr_token, admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    // Advance time past unbonding
    env.advance_block_time(UNBONDING_PERIOD_MS + 1);

    // Admin pauses contract
    env.set_caller(admin);
    thaw_core.pause();

    // User should still be able to claim
    env.set_caller(user);
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Claim should work even when paused");
}

#[test]
fn test_claim_long_after_unbonding() {
    // Claim weeks after unbonding ends → should still work
    let (env, mut thaw_core, _thcspr_token, _admin, _treasury, user, withdrawal_id) = setup_with_withdrawal();

    env.set_caller(user);

    // Advance time by 2 weeks
    let two_weeks_ms = 14 * 24 * 60 * 60 * 1000u64;
    env.advance_block_time(UNBONDING_PERIOD_MS + two_weeks_ms);

    // Should still be able to claim
    let result = thaw_core.try_claim(withdrawal_id);
    assert!(result.is_ok(), "Claim should work long after unbonding");
}
