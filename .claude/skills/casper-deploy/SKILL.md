---
name: casper-deploy
description: Casper contract deployment skill for building, testing, and deploying Odra contracts
---

# Casper Deploy Skill

You are in deployment mode for Casper smart contracts using the Odra framework.

---

## Project Context

**Project:** Thaw (Liquid Staking on Casper)
**Contracts Directory:** `./contracts/`
**Contracts:**
- `ThCsprToken` - Liquid staking token (thCSPR)
- `ThawCore` - Core staking/unstaking logic

---

## Networks

| Network | Chain Name | RPC | Key Path |
|---------|------------|-----|----------|
| **Localnet** | `casper-net-1` | `http://localhost:11101/rpc` | `../localnet/keys/faucet/secret_key.pem` |
| **Testnet** | `casper-test` | `https://node.testnet.casper.network/rpc` | `./keys/test_secret_key.pem` |

---

## Deployment Workflow

### Step 1: Pre-flight Checks

**For Localnet:**
```bash
# Check Docker container
docker ps --filter "name=mynctl" --format "{{.Names}}: {{.Status}}"

# If not running:
cd ../localnet && docker-compose up -d
# Wait 60 seconds for initialization
```

**For Testnet:**
```bash
# Check balance
cd ../safe-wallet && npm run balance thaw

# If < 5 CSPR, drip funds (ASK USER if > 1 CSPR)
cd ../safe-wallet && npm run drip thaw <amount>
```

### Step 2: Build Contracts

```bash
cd contracts
cargo odra build
```

Verify WASM files exist:
```bash
ls -la wasm/
```

### Step 3: Run Tests (Optional but Recommended)

```bash
cd contracts
cargo odra test
```

### Step 4: Update Odra.toml

**For Localnet:**
```toml
[livenet]
chain_name = "casper-net-1"
node_address = "http://localhost:11101/rpc"
secret_key_path = "../localnet/keys/faucet/secret_key.pem"
```

**For Testnet:**
```toml
[livenet]
chain_name = "casper-test"
node_address = "https://node.testnet.casper.network/rpc"
secret_key_path = "../keys/test_secret_key.pem"
```

### Step 5: Deploy

```bash
cd contracts
cargo odra deploy -b <ContractName>
```

Or deploy all:
```bash
cargo odra deploy
```

### Step 6: Post-Deployment

1. **Capture contract hash** from deployment output
2. **Update frontend config** with new contract address
3. **Verify deployment** by querying the contract

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Localnet not responding | `cd ../localnet && docker-compose restart` |
| Insufficient funds (testnet) | Drip more CSPR or fund safe-wallet |
| WASM not found | Run `cargo odra build` first |
| Deployment timeout | Increase gas/payment amount |

---

## Important Rules

1. **ALWAYS check network status** before deploying
2. **ALWAYS build** before deploying (`cargo odra build`)
3. **For testnet >1 CSPR drip** - ASK USER for approval
4. **Save contract hashes** - Update frontend configs
5. **Prefer localnet** for development/testing
