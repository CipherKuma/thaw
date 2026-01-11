---
description: Manage Casper localnet (start/stop/status/reset)
argument: <action> - "start", "stop", "status", or "reset"
---

# Localnet Management

Action: $ARGUMENTS

## Actions

### status (default if no argument)
```bash
docker ps --filter "name=mynctl" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

If running, also check network:
```bash
curl -s -X POST http://localhost:11101/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(f'Chain: {d[\"chainspec_name\"]}'); print(f'Block Height: {d[\"last_added_block_info\"][\"height\"]}'); print(f'Peers: {len(d[\"peers\"])}')"
```

### start
```bash
cd ../localnet && docker-compose up -d
```
Wait for healthy status, then report network info.

### stop
```bash
cd ../localnet && docker-compose stop
```

### reset
**Ask user for confirmation first** - this removes all deployed contracts!
```bash
cd ../localnet && docker-compose down -v && docker-compose up -d
```

## Quick Info
- RPC: http://localhost:11101/rpc
- Chain: casper-net-1
- Faucet key: ../localnet/keys/faucet/secret_key.pem
- User keys: ../localnet/keys/users/user-{1-10}/
