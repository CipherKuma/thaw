# Thaw

## One Liner

A liquid staking protocol with **leveraged staking** - stake CSPR, receive thCSPR, and amplify your yields up to 4x through built-in lending.

## Key Innovation Domains

- **Liquid Staking**
- **Leveraged Yield**
- **DeFi Primitives**
- **Integrated Lending**
- **Native Staking Integration**

## Detailed Build Description

Thaw is a liquid staking protocol built for Casper Network 2.0 that unlocks the liquidity of staked CSPR and enables **leveraged staking** for amplified yields.

### The Problem

1. **Locked Capital**: Native staking locks your CSPR, making it unusable in DeFi
2. **Limited Yields**: Standard staking gives ~8% APY with no way to amplify returns
3. **Fragmented DeFi**: Users need multiple protocols (staking + lending) to leverage positions

### Our Solution

Thaw solves all three problems in one protocol:

1. **Liquid Staking**: Stake CSPR → receive thCSPR (liquid, DeFi-compatible)
2. **Integrated Lending**: Built-in lending pool for borrowing against thCSPR
3. **One-Click Leverage**: `leverage_stake()` function automates leveraged positions up to 4x

### How Leveraged Staking Works

```
Standard Staking (1x):
  100 CSPR → 100 thCSPR → ~8% APY

Leveraged Staking (3x):
  100 CSPR → stake → 100 thCSPR
           → collateralize → borrow 75 CSPR
           → stake → 75 thCSPR
           → collateralize → borrow 56 CSPR
           → stake → 56 thCSPR

  Total: 100 CSPR input → 231 thCSPR exposure → ~18% APY*
```

*Higher returns come with liquidation risk if thCSPR price drops

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      THAW PROTOCOL                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   ThawCore  │     │  thCSPR     │     │ LendingPool │   │
│  │             │     │  Token      │     │             │   │
│  │ • stake()   │────▶│ • CEP-18    │◀────│ • deposit() │   │
│  │ • unstake() │     │ • mint/burn │     │ • borrow()  │   │
│  │ • compound()│     │             │     │ • leverage_ │   │
│  │             │     │             │     │   stake()   │   │
│  └──────┬──────┘     └─────────────┘     └─────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐                                        │
│  │  System Auction │  (Native Casper 2.0 delegation)       │
│  │  via Odra       │                                        │
│  └─────────────────┘                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Smart Contracts

| Contract | Description |
|----------|-------------|
| **ThawCore** | Main staking logic - stake/unstake/compound |
| **ThCsprToken** | CEP-18 liquid staking token |
| **LendingPool** | Lending, borrowing, and leveraged staking |

### Key Features

| Feature | Description |
|---------|-------------|
| **Liquid Staking** | Stake CSPR, receive thCSPR that appreciates |
| **Auto-Compounding** | Rewards increase thCSPR exchange rate |
| **Leveraged Staking** | One-click up to 4x leverage via `leverage_stake()` |
| **Lending Pool** | Deposit CSPR to earn from borrowers |
| **Collateralized Borrowing** | Use thCSPR as collateral to borrow CSPR |
| **Liquidations** | 5% bonus for liquidating unhealthy positions |
| **DeFi Compatible** | thCSPR is standard CEP-18, usable everywhere |

### Leveraged Staking Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Collateral Factor | 75% | Max borrow = 75% of collateral value |
| Liquidation Threshold | 80% | Position liquidated when debt > 80% of collateral |
| Liquidation Bonus | 5% | Reward for liquidators |
| Max Loops | 4 | Up to ~3.2x effective leverage |

### Exchange Rate Dynamics

```
Initial: 1 thCSPR = 1 CSPR
After rewards: 1 thCSPR = 1.1 CSPR (10% rewards)
After more rewards: 1 thCSPR = 1.21 CSPR (compounded)

Your 100 thCSPR from leveraged position worth MORE over time!
```

### Risk Considerations

Leveraged staking amplifies both gains AND risks:

- **Liquidation Risk**: If thCSPR/CSPR rate drops, position may be liquidated
- **Smart Contract Risk**: Multiple contracts interacting increases attack surface
- **Liquidity Risk**: May not be able to exit if lending pool is fully utilized

### Why Thaw?

The name "Thaw" represents:
1. **Unlocking** frozen/staked assets into liquid thCSPR
2. **Melting** the barriers between staking and DeFi
3. **Flowing** capital freely while still earning staking rewards

## Team

### Cipher Kuma
Smart contract developer with deep experience in staking protocols and tokenomics design. Dedicated to unlocking liquidity and maximizing capital efficiency in proof-of-stake networks.

### Joel Peter
Full-stack developer specializing in multi-chain applications and identity systems. Experienced in both EVM and non-EVM smart contract development with a passion for privacy-preserving technologies.

## Technology Stack Used

- [x] Odra Framework
- [ ] Native Casper Rust SDK
- [ ] CSPR.click
- [ ] CSPR.cloud
- [x] JavaScript/TypeScript SDK
- [ ] Python SDK
- [ ] Other

## Demo Flow

1. **Connect Wallet** - Show CSPR balance
2. **Simple Stake** - Stake 100 CSPR → receive 100 thCSPR
3. **Leveraged Stake** - Use `leverage_stake(3)` with 100 CSPR → get ~230 thCSPR exposure
4. **View Position** - Show health factor, collateral, borrowed amounts
5. **Unstake** - Demonstrate unbonding process
6. **Compound** - Show exchange rate increase after rewards

## Contract Addresses (Localnet)

Deployed and tested on NCTL localnet. Ready for testnet deployment.
