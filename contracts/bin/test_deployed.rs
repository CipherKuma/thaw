//! Test script for deployed contracts on localnet
//!
//! Tests basic functionality of ThawCore and ThCsprToken
//! Uses Odra's native delegation methods

use std::str::FromStr;

use odra::casper_types::U512;
use odra::host::{HostRef, HostRefLoader};
use odra::prelude::Address;
use thaw::{ThawCore, ThCsprToken};

fn main() {
    let env = odra_casper_livenet_env::env();
    let caller = env.caller();

    println!("=== Testing Deployed Contracts ===\n");
    println!("Caller: {}", caller.to_string());

    // Load deployed contracts - these will be set after fresh deployment
    let thaw_core_address = std::env::var("THAW_CORE_ADDRESS")
        .expect("THAW_CORE_ADDRESS env var must be set");
    let thcspr_address = std::env::var("THCSPR_ADDRESS")
        .expect("THCSPR_ADDRESS env var must be set");

    let thaw_core_addr = Address::from_str(&thaw_core_address).expect("Invalid ThawCore address");
    let thcspr_addr = Address::from_str(&thcspr_address).expect("Invalid ThCsprToken address");

    println!("ThawCore: {}", thaw_core_address);
    println!("ThCsprToken: {}", thcspr_address);

    // Load contracts
    let mut thaw_core = ThawCore::load(&env, thaw_core_addr);
    let thcspr_token = ThCsprToken::load(&env, thcspr_addr);

    // Test 1: Read basic view functions
    println!("\n--- Test 1: View Functions ---");

    let exchange_rate = thaw_core.get_exchange_rate();
    println!("Exchange Rate: {:?}", exchange_rate);

    let total_pooled = thaw_core.get_total_pooled();
    println!("Total Pooled CSPR: {:?}", total_pooled);

    let min_stake = thaw_core.get_min_stake();
    println!("Minimum Stake: {:?} (10 CSPR)", min_stake);

    let is_paused = thaw_core.is_paused();
    println!("Is Paused: {}", is_paused);

    // Test 2: Stake 20 CSPR
    println!("\n--- Test 2: Staking 20 CSPR ---");
    env.set_gas(15_000_000_000u64); // 15 CSPR gas

    let stake_amount = U512::from(20_000_000_000u64); // 20 CSPR
    println!("Staking: {} motes (20 CSPR)", stake_amount);

    let thcspr_received = thaw_core.with_tokens(stake_amount).stake();
    println!("SUCCESS! thCSPR received: {:?}", thcspr_received);

    // Check updated state
    println!("\n--- After Staking ---");
    let new_total_pooled = thaw_core.get_total_pooled();
    println!("Total Pooled CSPR: {:?}", new_total_pooled);

    let new_exchange_rate = thaw_core.get_exchange_rate();
    println!("Exchange Rate: {:?}", new_exchange_rate);

    // Check thCSPR balance
    let my_balance = thcspr_token.balance_of(caller);
    println!("My thCSPR balance: {:?}", my_balance);

    // Test 3: Unstake half of the thCSPR
    println!("\n--- Test 3: Unstaking 10 thCSPR ---");
    env.set_gas(15_000_000_000u64); // 15 CSPR gas

    let unstake_amount = U512::from(10_000_000_000u64); // 10 thCSPR
    println!("Unstaking: {} motes (10 thCSPR)", unstake_amount);

    let withdrawal_id = thaw_core.unstake(unstake_amount);
    println!("SUCCESS! Withdrawal ID: {:?}", withdrawal_id);

    // Check withdrawal request
    let withdrawal = thaw_core.get_withdrawal(withdrawal_id);
    println!("Withdrawal request: {:?}", withdrawal);

    // Check updated thCSPR balance
    let balance_after_unstake = thcspr_token.balance_of(caller);
    println!("My thCSPR balance after unstake: {:?}", balance_after_unstake);

    println!("\n=== All Tests Passed! ===");
}
