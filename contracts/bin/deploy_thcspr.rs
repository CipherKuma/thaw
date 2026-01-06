//! Deploy ThCsprToken only - uses existing ThawCore
//!
//! Run with: cargo run --bin deploy_thcspr --features livenet --release

use odra::host::{Deployer, HostRef};
use odra::prelude::{Addressable, Address};
use thaw::{ThCsprToken, ThCsprTokenInitArgs, ThawCoreHostRef};

fn main() {
    // Load the Casper livenet environment
    let env = odra_casper_livenet_env::env();

    // Existing ThawCore address from previous deployment
    let thaw_core_hash = "hash-6dcfc9d903e1c8757503b44f0bd104fcbbe2cd9807dcdf0fe4e9044382596b79";
    let thaw_core_address = Address::new(thaw_core_hash)
        .expect("Invalid ThawCore address");

    println!("Using existing ThawCore: {}", thaw_core_hash);

    // Deploy ThCsprToken with ThawCore as minter
    println!("\n=== Deploying ThCsprToken ===");
    env.set_gas(350_000_000_000u64); // 350 CSPR gas

    let thcspr_init_args = ThCsprTokenInitArgs {
        minter: thaw_core_address,
    };

    let thcspr_token = ThCsprToken::deploy(&env, thcspr_init_args);
    let thcspr_address = thcspr_token.address();
    println!("ThCsprToken deployed at: {}", thcspr_address.to_string());

    // Update ThawCore's thcspr_token address
    println!("\n=== Updating ThawCore's thCSPR token reference ===");
    env.set_gas(10_000_000_000u64); // 10 CSPR gas

    let mut thaw_core = ThawCoreHostRef::new(thaw_core_address, env.clone());
    thaw_core.set_thcspr_token(thcspr_address);
    println!("ThawCore's thCSPR token updated to: {}", thcspr_address.to_string());

    // Summary
    println!("\n=== Deployment Summary ===");
    println!("ThawCore: {}", thaw_core_hash);
    println!("ThCsprToken: {}", thcspr_address.to_string());
    println!("\nDeployment complete!");
}
