//! thCSPR Token - CEP-18 compliant liquid staking token
//!
//! This is a placeholder implementation that will be expanded in later prompts.

use odra::prelude::*;
use odra::casper_types::{U256, U512};
use odra_modules::cep18_token::Cep18;

use crate::errors::Error;

/// thCSPR - Liquid staking token representing staked CSPR
#[odra::module]
pub struct ThCsprToken {
    /// CEP-18 token implementation
    cep18: SubModule<Cep18>,
    /// Address authorized to mint/burn (ThawCore contract)
    minter: Var<Address>,
}

#[odra::module]
impl ThCsprToken {
    /// Initialize the thCSPR token
    pub fn init(&mut self, minter: Address) {
        self.cep18.init(
            "Thaw Staked CSPR".to_string(),
            "thCSPR".to_string(),
            9, // Same decimals as CSPR
            U256::zero(), // Initial supply
        );
        self.minter.set(minter);
    }

    /// Mint thCSPR - only callable by ThawCore
    /// Converts U512 to U256 for CEP-18 compatibility
    pub fn mint(&mut self, to: Address, amount: U512) {
        self.require_minter();
        let amount_u256 = U256::from(amount.as_u128());
        self.cep18.raw_mint(&to, &amount_u256);
    }

    /// Burn thCSPR - only callable by ThawCore
    /// Converts U512 to U256 for CEP-18 compatibility
    pub fn burn(&mut self, from: Address, amount: U512) {
        self.require_minter();
        let amount_u256 = U256::from(amount.as_u128());
        self.cep18.raw_burn(&from, &amount_u256);
    }

    /// Transfer tokens - standard CEP-18 passthrough
    pub fn transfer(&mut self, to: Address, amount: U256) {
        self.cep18.transfer(&to, &amount);
    }

    /// Approve spender - standard CEP-18 passthrough
    pub fn approve(&mut self, spender: Address, amount: U256) {
        self.cep18.approve(&spender, &amount);
    }

    /// Transfer from - standard CEP-18 passthrough
    pub fn transfer_from(&mut self, owner: Address, to: Address, amount: U256) {
        self.cep18.transfer_from(&owner, &to, &amount);
    }

    /// Get token balance - standard CEP-18 view
    pub fn balance_of(&self, owner: Address) -> U256 {
        self.cep18.balance_of(&owner)
    }

    /// Get allowance - standard CEP-18 view
    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.cep18.allowance(&owner, &spender)
    }

    /// Get total supply
    pub fn total_supply(&self) -> U256 {
        self.cep18.total_supply()
    }

    /// Get token name
    pub fn name(&self) -> String {
        self.cep18.name()
    }

    /// Get token symbol
    pub fn symbol(&self) -> String {
        self.cep18.symbol()
    }

    /// Get token decimals
    pub fn decimals(&self) -> u8 {
        self.cep18.decimals()
    }

    /// Get current minter address
    pub fn get_minter(&self) -> Option<Address> {
        self.minter.get()
    }

    // Internal functions

    fn require_minter(&self) {
        let minter = self.minter.get().unwrap_or_revert_with(&self.env(), Error::MinterNotSet);
        if self.env().caller() != minter {
            self.env().revert(Error::NotMinter);
        }
    }
}
