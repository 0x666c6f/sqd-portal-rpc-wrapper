# Development

## Commands
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run bench`

## Local requests
Single-chain:

```bash
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Multi-chain:

```bash
curl -s -X POST http://localhost:8080/v1/evm/1 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

## Benchmark
Compare wrapper vs real RPC for supported methods.

```bash
RPC_URL=https://base.llamarpc.com \
WRAPPER_URL=http://localhost:8080/v1/evm/8453 \
CHAIN_ID=8453 \
BENCH_ITERATIONS=25 \
BENCH_CONCURRENCY=1 \
npm run bench
```

Optional:
- `WRAPPER_HEADERS='{\"x-chain-id\":\"8453\"}'` for root URL
- `BENCH_BLOCK_NUMBER=0x1234`
- `BENCH_BLOCK_HASH=0x...`
- `BENCH_TX_INDEX=0x0`
- `BENCH_TX_HASH=0x...`
- `BENCH_BLOCK_OFFSET=1000`
- `BENCH_BLOCK_SEARCH_DEPTH=5`
- `BENCH_TIMEOUT_MS=8000`
- `--json` for machine output
