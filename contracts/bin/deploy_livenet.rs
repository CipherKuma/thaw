//! Livenet deployment script for Thaw contracts
//!
//! Deploys ThCsprToken and ThawCore to Casper network
//! Uses Odra's native delegation methods (no manual auction address needed)

use odra::casper_types::{AsymmetricType, PublicKey};
use odra::host::Deployer;
use odra::prelude::Addressable;
use thaw::{ThCsprToken, ThCsprTokenInitArgs, ThawCore, ThawCoreInitArgs};

fn main() {
    // Load the Casper livenet environment
    let env = odra_casper_livenet_env::env();

    // Caller is the deployer and admin
    let deployer = env.caller();
    println!("Deployer address: {}", deployer.to_string());

    // Get validator public key from environment or use default for localnet
    let validator_hex = std::env::var("VALIDATOR_PUBLIC_KEY")
        .unwrap_or_else(|_| "0146c64D0506C486f2B19F9cF73479fbA550f33227b6Ec1C12E58B437D2680E96D".to_string());
    let validator = PublicKey::from_hex(&validator_hex)
        .expect("Invalid validator public key");
    println!("Validator: {}", validator_hex);

    // Treasury - same as deployer for now
    let treasury = deployer;
    println!("Treasury: {}", treasury.to_string());

    // Step 1: Deploy ThawCore first with deployer as placeholder for thcspr_token
    // We'll update it after deploying ThCsprToken
    println!("\n=== Deploying ThawCore ===");
    env.set_gas(400_000_000_000u64); // 400 CSPR gas

    let thaw_core_init_args = ThawCoreInitArgs {
        thcspr_token: deployer,  // placeholder - will update
        validator,
        treasury,
        admin: deployer,
    };

    let thaw_core = ThawCore::deploy(&env, thaw_core_init_args);
    let thaw_core_address = thaw_core.address();
    println!("ThawCore deployed at: {}", thaw_core_address.to_string());

    // Step 2: Deploy ThCsprToken with ThawCore as minter
    println!("\n=== Deploying ThCsprToken ===");
    env.set_gas(200_000_000_000u64); // 200 CSPR gas (CEP-18 needs more)

    let thcspr_init_args = ThCsprTokenInitArgs {
        minter: thaw_core_address,
    };

    let thcspr_token = ThCsprToken::deploy(&env, thcspr_init_args);
    let thcspr_address = thcspr_token.address();
    println!("ThCsprToken deployed at: {}", thcspr_address.to_string());

    // Step 3: Update ThawCore's thcspr_token address
    println!("\n=== Updating ThawCore's thCSPR token reference ===");
    env.set_gas(5_000_000_000u64); // 5 CSPR gas

    let mut thaw_core = thaw_core;
    thaw_core.set_thcspr_token(thcspr_address);
    println!("ThawCore's thCSPR token updated");

    // Verify deployment
    println!("\n=== Deployment Summary ===");
    println!("ThawCore: {}", thaw_core_address.to_string());
    println!("ThCsprToken: {}", thcspr_address.to_string());
    println!("Admin: {}", deployer.to_string());
    println!("Validator: {}", validator_hex);
    println!("\nDeployment complete!");
}
