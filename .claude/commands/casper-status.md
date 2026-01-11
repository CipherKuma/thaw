---
description: Check Casper network and wallet status
argument: <network> - "localnet", "testnet", or "all" (default)
---

# Casper Status Check

Network: $ARGUMENTS

## Steps

### Check Localnet
```bash
echo "=== LOCALNET ==="
docker ps --filter "name=mynctl" --format "{{.Names}}: {{.Status}}" || echo "Not running"
```

If running:
```bash
curl -s -X POST http://localhost:11101/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin).get('result',{}); print(f'  Block Height: {d.get(\"last_added_block_info\",{}).get(\"height\",\"N/A\")}'); print(f'  Peers: {len(d.get(\"peers\",[]))}')" 2>/dev/null || echo "  Cannot connect"
```

### Check Testnet Balance
```bash
echo "=== TESTNET ==="
cd ../safe-wallet && npm run balance thaw 2>/dev/null || echo "Cannot check balance"
```

### Summary Table
Report:
| Network | Status | Details |
|---------|--------|---------|
| Localnet | Running/Stopped | Block height, peers |
| Testnet | Balance | X CSPR available |
