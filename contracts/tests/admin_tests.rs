//! Admin tests for Thaw liquid staking protocol

mod test_utils;

use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;

use thaw::thaw_core::{ThawCore, ThawCoreHostRef, ThawCoreInitArgs};
use thaw::thcspr_token::{ThCsprToken, ThCsprTokenHostRef, ThCsprTokenInitArgs};
use thaw::errors::Error;
use thaw::events::{AdminTransferred, FeeUpdated, Paused, Unpaused};

use test_utils::*;

/// Helper to setup test environment
fn setup() -> (HostEnv, ThawCoreHostRef, ThCsprTokenHostRef, Address, Address) {
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

    (env, thaw_core, thcspr_token, admin, user)
}

#[test]
fn test_pause_unpause() {
    // Admin pause → stake fails → unpause → stake succeeds
    let (env, mut thaw_core, _thcspr_token, admin, user) = setup();

    // Admin pauses
    env.set_caller(admin);
    thaw_core.pause();
    assert!(thaw_core.is_paused(), "Contract should be paused");

    // User tries to stake while paused
    env.set_caller(user);
    let stake_amount = U512::from(100u64 * CSPR);
    let result = thaw_core.with_tokens(stake_amount).try_stake();
    assert!(result.is_err(), "Staking should fail when paused");
    assert_eq!(result.unwrap_err(), Error::ContractPaused.into());

    // Admin unpauses
    env.set_caller(admin);
    thaw_core.unpause();
    assert!(!thaw_core.is_paused(), "Contract should be unpaused");

    // User can now stake
    env.set_caller(user);
    let result = thaw_core.with_tokens(stake_amount).try_stake();
    assert!(result.is_ok(), "Staking should succeed after unpause");
}

#[test]
fn test_non_admin_pause() {
    // Non-admin tries pause → revert "Not admin"
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let result = thaw_core.try_pause();
    assert!(result.is_err(), "Non-admin should not be able to pause");
    assert_eq!(
        result.unwrap_err(),
        Error::NotAdmin.into(),
        "Should revert with NotAdmin error"
    );
}

#[test]
fn test_non_admin_unpause() {
    // Non-admin tries unpause → revert "Not admin"
    let (env, mut thaw_core, _thcspr_token, admin, user) = setup();

    // Admin pauses first
    env.set_caller(admin);
    thaw_core.pause();

    // Non-admin tries to unpause
    env.set_caller(user);
    let result = thaw_core.try_unpause();
    assert!(result.is_err(), "Non-admin should not be able to unpause");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_set_fee_valid() {
    // Admin can set fee within valid range
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    // Set fee to 5% (500 bps)
    thaw_core.set_protocol_fee(500);
    assert_eq!(thaw_core.get_protocol_fee_bps(), 500);

    // Set fee to 20% (2000 bps)
    thaw_core.set_protocol_fee(2000);
    assert_eq!(thaw_core.get_protocol_fee_bps(), 2000);

    // Set fee to 0%
    thaw_core.set_protocol_fee(0);
    assert_eq!(thaw_core.get_protocol_fee_bps(), 0);

    // Set fee to max 30% (3000 bps)
    thaw_core.set_protocol_fee(3000);
    assert_eq!(thaw_core.get_protocol_fee_bps(), 3000);
}

#[test]
fn test_set_fee_too_high() {
    // Set fee 50% → revert "Fee too high"
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    // Try to set fee to 50% (5000 bps) - above 30% max
    let result = thaw_core.try_set_protocol_fee(5000);
    assert!(result.is_err(), "Setting fee above max should fail");
    assert_eq!(
        result.unwrap_err(),
        Error::FeeTooHigh.into(),
        "Should revert with FeeTooHigh error"
    );

    // Try to set fee to 31% (3100 bps) - just above max
    let result = thaw_core.try_set_protocol_fee(3100);
    assert!(result.is_err(), "Setting fee just above max should fail");
}

#[test]
fn test_non_admin_set_fee() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let result = thaw_core.try_set_protocol_fee(500);
    assert!(result.is_err(), "Non-admin should not be able to set fee");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_transfer_admin() {
    // Transfer admin → old admin can't call → new admin can
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    let new_admin = env.get_account(5);

    // Current admin transfers to new admin
    env.set_caller(admin);
    thaw_core.transfer_admin(new_admin);

    // Verify new admin
    assert_eq!(thaw_core.get_admin(), Some(new_admin));

    // Old admin can no longer pause
    env.set_caller(admin);
    let result = thaw_core.try_pause();
    assert!(result.is_err(), "Old admin should not be able to pause");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());

    // New admin can pause
    env.set_caller(new_admin);
    let result = thaw_core.try_pause();
    assert!(result.is_ok(), "New admin should be able to pause");
}

#[test]
fn test_non_admin_transfer_admin() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let new_admin = env.get_account(5);
    let result = thaw_core.try_transfer_admin(new_admin);
    assert!(result.is_err(), "Non-admin should not be able to transfer admin");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_set_min_stake() {
    let (env, mut thaw_core, _thcspr_token, admin, user) = setup();

    env.set_caller(admin);

    // Set minimum stake to 50 CSPR
    let new_min = U512::from(50u64 * CSPR);
    thaw_core.set_min_stake(new_min);
    assert_eq!(thaw_core.get_min_stake(), new_min);

    // User tries to stake below new minimum
    env.set_caller(user);
    let stake_amount = U512::from(20u64 * CSPR);
    let result = thaw_core.with_tokens(stake_amount).try_stake();
    assert!(result.is_err(), "Staking below new minimum should fail");

    // User can stake at new minimum
    let result = thaw_core.with_tokens(new_min).try_stake();
    assert!(result.is_ok(), "Staking at new minimum should succeed");
}

#[test]
fn test_non_admin_set_min_stake() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let result = thaw_core.try_set_min_stake(U512::from(100u64 * CSPR));
    assert!(result.is_err(), "Non-admin should not be able to set min stake");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_set_treasury() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    let new_treasury = env.get_account(6);
    thaw_core.set_treasury(new_treasury);
    assert_eq!(thaw_core.get_treasury(), Some(new_treasury));
}

#[test]
fn test_non_admin_set_treasury() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let new_treasury = env.get_account(6);
    let result = thaw_core.try_set_treasury(new_treasury);
    assert!(result.is_err(), "Non-admin should not be able to set treasury");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_set_validator() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    let new_validator = create_mock_validator_key();
    thaw_core.set_validator(new_validator.clone());
    assert_eq!(thaw_core.get_validator(), Some(new_validator));
}

#[test]
fn test_non_admin_set_validator() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let new_validator = create_mock_validator_key();
    let result = thaw_core.try_set_validator(new_validator);
    assert!(result.is_err(), "Non-admin should not be able to set validator");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_set_auction() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    let new_auction = env.get_account(8);
    thaw_core.set_auction(new_auction);
    assert_eq!(thaw_core.get_auction(), Some(new_auction));
}

#[test]
fn test_non_admin_set_auction() {
    let (env, mut thaw_core, _thcspr_token, _admin, user) = setup();

    env.set_caller(user);

    let new_auction = env.get_account(8);
    let result = thaw_core.try_set_auction(new_auction);
    assert!(result.is_err(), "Non-admin should not be able to set auction");
    assert_eq!(result.unwrap_err(), Error::NotAdmin.into());
}

#[test]
fn test_pause_emits_event() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);
    thaw_core.pause();

    let expected_event = Paused { by: admin };
    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit Paused event"
    );
}

#[test]
fn test_unpause_emits_event() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);
    thaw_core.pause();
    thaw_core.unpause();

    let expected_event = Unpaused { by: admin };
    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit Unpaused event"
    );
}

#[test]
fn test_set_fee_emits_event() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    let old_fee = thaw_core.get_protocol_fee_bps();
    let new_fee = 500u64;
    thaw_core.set_protocol_fee(new_fee);

    let expected_event = FeeUpdated {
        old_fee_bps: old_fee,
        new_fee_bps: new_fee,
    };
    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit FeeUpdated event"
    );
}

#[test]
fn test_transfer_admin_emits_event() {
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    let new_admin = env.get_account(5);
    thaw_core.transfer_admin(new_admin);

    let expected_event = AdminTransferred {
        old_admin: admin,
        new_admin,
    };
    assert!(
        env.emitted_event(&thaw_core, expected_event),
        "Should emit AdminTransferred event"
    );
}

#[test]
fn test_double_pause() {
    // Pausing twice should not cause issues
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    thaw_core.pause();
    assert!(thaw_core.is_paused());

    // Pausing again should succeed (idempotent)
    let result = thaw_core.try_pause();
    assert!(result.is_ok(), "Pausing twice should be allowed");
    assert!(thaw_core.is_paused());
}

#[test]
fn test_double_unpause() {
    // Unpausing when not paused should be fine
    let (env, mut thaw_core, _thcspr_token, admin, _user) = setup();

    env.set_caller(admin);

    // Already unpaused
    assert!(!thaw_core.is_paused());

    // Unpause when not paused should succeed
    let result = thaw_core.try_unpause();
    assert!(result.is_ok(), "Unpausing when not paused should be allowed");
}

#[test]
fn test_initial_admin() {
    // Verify admin is set correctly on deployment
    let (_env, thaw_core, _thcspr_token, admin, _user) = setup();

    assert_eq!(thaw_core.get_admin(), Some(admin), "Admin should be set on deployment");
}

#[test]
fn test_initial_paused_state() {
    // Contract should not be paused initially
    let (_env, thaw_core, _thcspr_token, _admin, _user) = setup();

    assert!(!thaw_core.is_paused(), "Contract should not be paused initially");
}
