---
description: Deploy contracts to Casper network (localnet/testnet)
argument: <network> - "localnet" or "testnet"
---

# Deploy Contracts

Deploy to: $ARGUMENTS

## Steps

1. **Parse network argument**
   - `localnet` → Deploy to local NCTL Docker
   - `testnet` → Deploy to Casper testnet
   - If no argument, ask user which network

2. **For LOCALNET deployment:**
   ```bash
   # Check localnet is running
   docker ps --filter "name=mynctl" --format "{{.Names}}: {{.Status}}"
   ```
   - If not running, start it: `cd ../localnet && docker-compose up -d`
   - Wait for healthy status
   - Build contracts: `cd contracts && cargo odra build`
   - Deploy using faucet key from `../localnet/keys/faucet/secret_key.pem`

3. **For TESTNET deployment:**
   - Check balance: `cd ../safe-wallet && npm run balance thaw`
   - If balance < 5 CSPR, drip funds (ask user if > 1 CSPR needed)
   - Build contracts: `cd contracts && cargo odra build`
   - Deploy using key from `./keys/test_secret_key.pem`

4. **After deployment:**
   - Report deployed contract hash(es)
   - Suggest updating frontend config with new addresses

## Network Configs

| Network | Chain | RPC | Key |
|---------|-------|-----|-----|
| localnet | casper-net-1 | http://localhost:11101/rpc | ../localnet/keys/faucet/secret_key.pem |
| testnet | casper-test | https://node.testnet.casper.network/rpc | ./keys/test_secret_key.pem |
