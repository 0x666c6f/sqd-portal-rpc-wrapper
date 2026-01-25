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

## Errors
Common JSON-RPC error mapping:

| Condition | HTTP | Code | Notes |
| --- | --- | --- | --- |
| Parse error | 400 | -32700 | Invalid JSON |
| Invalid request | 400 | -32600 | Non-JSON-RPC payload |
| Invalid params | 400 | -32602 | Validation errors |
| Range too large / too many addresses | 400 | -32012 | Log range / address limits |
| Method not supported | 404 | -32601 | Upstream-only without upstream |
| Not found | 404 | -32014 | Missing block data |
| Unauthorized | 401 | -32016 | Wrapper or Portal key |
| Rate limit | 429 | -32005 | Portal throttling |
| Conflict | 409 | -32603 | Reorg conflict with `previousBlocks` |
| Timeout | 504 | -32000 | Handler timeout |
| Server error / unavailable | 502/503 | -32603 | Upstream/Portal errors |

## Finality
- `latest`/empty: `/head` + `/stream`
- `finalized`/`safe`: `/finalized-head` + `/finalized-stream` with fallback to non-finalized if 404
- `pending`: invalid params (message contains `pending block not found`)
- `earliest`: block 0

## Start block
If Portal metadata provides `start_block`, requests for blocks before that height return:
- `null` for block/transaction lookups
- `[]` for log/trace queries

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
