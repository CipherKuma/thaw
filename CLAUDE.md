# Thaw - Claude Instructions

## Project Overview
Thaw is a liquid staking protocol on Casper Network using the Odra framework.

## Directory Structure
```
thaw/
├── contracts/           # Odra smart contracts
│   ├── src/            # Contract source code
│   ├── tests/          # Contract tests
│   ├── wasm/           # Compiled WASM files
│   └── Odra.toml       # Odra configuration
├── frontend/           # Next.js frontend
├── keys/               # Wallet keys for deployment
└── prompts/            # Strategy prompts
```

## Contracts
- `ThCsprToken` - Liquid staking token (thCSPR)
- `ThawCore` - Core staking/unstaking logic

---

## Casper Deployment Guide

### Networks Available

| Network | Chain Name | RPC Endpoint | Use Case |
|---------|------------|--------------|----------|
| **Localnet** | `casper-net-1` | `http://localhost:11101/rpc` | Fast iteration, free |
| **Testnet** | `casper-test` | `https://node.testnet.casper.network/rpc` | Pre-production |
| **Mainnet** | `casper` | `https://node.mainnet.casper.network/rpc` | Production |

### Localnet (NCTL Docker)

The shared localnet is at `../localnet/`. All projects share this instance.

**Check if running:**
```bash
docker ps --filter "name=mynctl" --format "{{.Names}}: {{.Status}}"
```

**Start localnet:**
```bash
cd ../localnet && docker-compose up -d
```

**Stop localnet:**
```bash
cd ../localnet && docker-compose stop
```

**Reset localnet (clear all deployed contracts):**
```bash
cd ../localnet && docker-compose down -v && docker-compose up -d
```

### Localnet Keys
Pre-funded accounts are available at `../localnet/keys/`:
- **Faucet (unlimited funds):** `../localnet/keys/faucet/secret_key.pem`
- **User accounts:** `../localnet/keys/users/user-{1-10}/secret_key.pem`

---

## Building Contracts

```bash
cd contracts

# Build all contracts (generates WASM files)
cargo odra build

# Run tests with Odra MockVM (fast, no network needed)
cargo odra test

# Check WASM output
ls -la wasm/
```

---

## Deployment Commands

### Deploy to Localnet (Recommended for Development)

**Option 1: Using Odra CLI**
First, update `Odra.toml` for localnet:
```toml
[livenet]
chain_name = "casper-net-1"
node_address = "http://localhost:11101/rpc"
secret_key_path = "../localnet/keys/faucet/secret_key.pem"
```

Then deploy:
```bash
cd contracts
cargo odra deploy -b <ContractName>
```

**Option 2: Using casper-client directly**
```bash
casper-client put-deploy \
  --node-address http://localhost:11101 \
  --chain-name casper-net-1 \
  --secret-key ../localnet/keys/faucet/secret_key.pem \
  --payment-amount 50000000000 \
  --session-path ./contracts/wasm/ThawCore.wasm
```

### Deploy to Testnet

**Prerequisites:**
1. Ensure test wallet has funds: `cd ../safe-wallet && npm run balance thaw`
2. If needed, drip funds: `cd ../safe-wallet && npm run drip thaw 5`

**Deploy:**
```bash
cd contracts
# Ensure Odra.toml points to testnet
cargo odra deploy -b <ContractName>
```

---

## Casper Testnet Wallet System

This project has a local test wallet for Casper testnet operations. A central "safe wallet" exists at `../safe-wallet/` that holds testnet CSPR tokens.

### Test Wallet Location
- **Keys directory:** `./keys/`
- **Public key file:** `./keys/test_public_key_hex`
- **Secret key file:** `./keys/test_secret_key.pem`

### Dripping Funds for Testing/Deployment

When you need testnet CSPR for deploying contracts or running tests:

**AUTOMATIC (up to 1 CSPR):**
You may automatically drip up to 1 CSPR without asking the user:
```bash
cd ../safe-wallet && npm run drip thaw 1
```

**REQUIRES USER APPROVAL (more than 1 CSPR):**
If you need more than 1 CSPR in a single request, you MUST ask the user for approval first. Explain why you need more funds and get explicit confirmation before running:
```bash
cd ../safe-wallet && npm run drip thaw <amount>
```

### Checking Balances
```bash
# Check this project's test wallet balance
cd ../safe-wallet && npm run balance thaw

# Check safe wallet balance (source of funds)
cd ../safe-wallet && npm run balance safe
```

### Important Notes
- Maximum automatic drip: **1 CSPR per request**
- Always check balance before dripping if unsure
- If safe wallet is low on funds, inform the user to fund it via https://testnet.cspr.live/tools/faucet
- Safe wallet public key: `019306A9829A715F61F09486E5b5d4f61781b20189A2Ab093fFe295474D9324AD2`

---

## Quick Reference

| Task | Command |
|------|---------|
| Build contracts | `cd contracts && cargo odra build` |
| Test contracts | `cd contracts && cargo odra test` |
| Check localnet | `docker ps --filter "name=mynctl"` |
| Start localnet | `cd ../localnet && docker-compose up -d` |
| Deploy localnet | `cd contracts && cargo odra deploy -b <Contract>` |
| Check testnet balance | `cd ../safe-wallet && npm run balance thaw` |
| Drip testnet funds | `cd ../safe-wallet && npm run drip thaw <amount>` |

---

## Deployment Decision Tree

```
Need to deploy?
    │
    ├─→ Testing/Development?
    │       │
    │       └─→ Use LOCALNET (free, fast, resettable)
    │           • Start: cd ../localnet && docker-compose up -d
    │           • Deploy: Use faucet key from ../localnet/keys/faucet/
    │
    └─→ Pre-production/Demo?
            │
            └─→ Use TESTNET
                • Check balance first
                • Drip funds if needed (≤1 CSPR auto, >1 CSPR ask user)
                • Deploy: Use key from ./keys/
```
