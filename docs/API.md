# JSON-RPC API

Supported methods:
- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getBlockByHash` (requires upstream RPC)
- `eth_getTransactionByHash` (requires upstream RPC)
- `eth_getTransactionReceipt` (requires upstream RPC)
- `eth_getTransactionByBlockNumberAndIndex`
- `eth_getLogs`
- `trace_block`
- `trace_transaction` (requires upstream RPC)

Unsupported methods (or upstream-only methods without upstream configured) return HTTP 404 with JSON-RPC error `-32601` and message containing `method not supported`.

## Finality
- `latest`/empty: `/head` + `/stream`
- `finalized`/`safe`: `/finalized-head` + `/finalized-stream` with fallback to non-finalized if 404
- `pending`: invalid params (message contains `pending block not found`)
- `earliest`: block 0

## Capabilities
`GET /capabilities`

Response shape:
```json
{
  "service": { "name": "sqd-portal-rpc-wrapper", "version": "0.1.0" },
  "mode": "single",
  "methods": ["eth_chainId","eth_blockNumber","eth_getBlockByNumber","eth_getBlockByHash","eth_getTransactionByHash","eth_getTransactionReceipt","eth_getTransactionByBlockNumberAndIndex","eth_getLogs","trace_block","trace_transaction"],
  "chains": {
    "1": {
      "dataset": "ethereum-mainnet",
      "aliases": ["eth"],
      "startBlock": 0,
      "realTime": true
    }
  },
  "portalEndpoints": {
    "head": "https://portal.sqd.dev/datasets/{dataset}/head",
    "finalizedHead": "https://portal.sqd.dev/datasets/{dataset}/finalized-head",
    "stream": "https://portal.sqd.dev/datasets/{dataset}/stream",
    "finalizedStream": "https://portal.sqd.dev/datasets/{dataset}/finalized-stream",
    "metadata": "https://portal.sqd.dev/datasets/{dataset}/metadata"
  }
}
```
