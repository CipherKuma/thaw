//! Mock System Auction contract for testing
//!
//! This mock simply accepts all auction calls without doing anything.

use odra::casper_types::{PublicKey, U512};
use odra::prelude::*;

/// Mock System Auction contract for testing
#[odra::module]
pub struct MockAuction {
    // Track delegated amount for testing
    total_delegated: Var<U512>,
    pending_rewards: Var<U512>,
}

#[odra::module]
impl MockAuction {
    pub fn init(&mut self) {
        self.total_delegated.set(U512::zero());
        self.pending_rewards.set(U512::zero());
    }

    /// Mock delegate - just accepts the call
    #[odra(payable)]
    #[allow(unused_variables)]
    pub fn delegate(
        &mut self,
        delegator: PublicKey,
        validator: PublicKey,
        amount: U512,
    ) {
        let current = self.total_delegated.get_or_default();
        self.total_delegated.set(current + amount);
    }

    /// Mock undelegate - just accepts the call
    #[allow(unused_variables)]
    pub fn undelegate(
        &mut self,
        delegator: PublicKey,
        validator: PublicKey,
        amount: U512,
    ) {
        let current = self.total_delegated.get_or_default();
        if current >= amount {
            self.total_delegated.set(current - amount);
        }
    }

    /// Mock get_delegator_reward - returns configured pending rewards
    #[allow(unused_variables)]
    pub fn get_delegator_reward(
        &self,
        delegator: PublicKey,
        validator: PublicKey,
    ) -> U512 {
        self.pending_rewards.get_or_default()
    }

    /// Mock withdraw_delegator_reward - clears pending rewards
    #[allow(unused_variables)]
    pub fn withdraw_delegator_reward(
        &mut self,
        delegator: PublicKey,
        validator: PublicKey,
    ) {
        self.pending_rewards.set(U512::zero());
    }

    // Test helper to set pending rewards
    pub fn set_pending_rewards(&mut self, amount: U512) {
        self.pending_rewards.set(amount);
    }

    // Test helper to get total delegated
    pub fn get_total_delegated(&self) -> U512 {
        self.total_delegated.get_or_default()
    }
}
