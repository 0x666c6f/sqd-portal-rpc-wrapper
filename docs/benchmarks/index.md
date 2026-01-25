# Benchmarks

Generated: 2026-01-25 23:03:03 UTC

## Summary

Methods with successful measurements on both wrapper and reference RPC:

| method | wrapper mean ms | rpc mean ms | speedup (rpc/wrapper) |
| --- | --- | --- | --- |
| eth_blockNumber | 41.1 | 44.23 | 1.08x |
| eth_getBlockByHash | 48.97 | 42.9 | 0.88x |
| eth_getBlockByNumber(fullTx=false) | 96.93 | 46.26 | 0.48x |
| eth_getBlockByNumber(fullTx=true) | 101.69 | 54.52 | 0.54x |
| eth_getLogs | 52.7 | 42.38 | 0.8x |
| eth_getTransactionByBlockNumberAndIndex | 92.75 | 44.16 | 0.48x |
| eth_getTransactionByHash | 43.2 | 42.21 | 0.98x |
| eth_getTransactionReceipt | 45.92 | 40.55 | 0.88x |
| trace_block | 280.28 | 214.7 | 0.77x |
| trace_transaction | 51.11 | 44.62 | 0.87x |

Batch sizing impact:

### eth_blockNumber

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 47.27 | 47.27 | 65 | 1 |
| rpc | 1 | 43.47 | 43.47 | 65 | 1 |
| wrapper | 5 | 41.86 | 8.37 | 321 | 1 |
| rpc | 5 | 49.75 | 9.95 | 321 | 1 |
| wrapper | 10 | 41.85 | 4.19 | 642 | 1 |
| rpc | 10 | 50.1 | 5.01 | 642 | 1 |
| wrapper | 25 | 42.13 | 1.69 | 1617 | 1 |
| rpc | 25 | 55.13 | 2.21 | 1617 | 1 |
| wrapper | 1000 | 47.46 | 0.05 | 65894 | 1 |
| rpc | 1000 | 231.21 | 0.23 | 65894 | 1 |
| wrapper | 10000 | 56.22 | 0.01 | 668895 | 1 |
| rpc | 10000 | 2563.68 | 0.26 | 668895 | 10 |

### eth_getBlockByNumber

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 102.55 | 102.55 | 87 | 1 |
| rpc | 1 | 45.01 | 45.01 | 87 | 1 |
| wrapper | 5 | 86.67 | 17.33 | 431 | 1 |
| rpc | 5 | 53.24 | 10.65 | 431 | 1 |
| wrapper | 10 | 88.65 | 8.87 | 862 | 1 |
| rpc | 10 | 59.2 | 5.92 | 862 | 1 |
| wrapper | 25 | 89.69 | 3.59 | 2167 | 1 |
| rpc | 25 | 74.35 | 2.97 | 2167 | 1 |
| wrapper | 100 | 98.06 | 0.98 | 8693 | 1 |
| rpc | 100 | 100.78 | 1.01 | 8693 | 1 |

### eth_getLogs

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 55.88 | 55.88 | 243 | 1 |
| rpc | 1 | 45.39 | 45.39 | 243 | 1 |
| wrapper | 5 | 55.32 | 11.06 | 1211 | 1 |
| rpc | 5 | 55.74 | 11.15 | 1211 | 1 |
| wrapper | 10 | 52.27 | 5.23 | 2422 | 1 |
| rpc | 10 | 63.74 | 6.37 | 2422 | 1 |
| wrapper | 25 | 54.87 | 2.19 | 6067 | 1 |
| rpc | 25 | 61.72 | 2.47 | 6067 | 1 |
| wrapper | 100 | 62.73 | 0.63 | 24293 | 1 |
| rpc | 100 | 88.2 | 0.88 | 24293 | 1 |


Note: some large batches were split into chunks due to upstream limits. The "chunks" column indicates how many requests were used.

## Charts

### Mean Latency by Method

<LatencyChart
  title="Mean Latency by Method"
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :wrapper-data="[41.1, 48.97, 96.93, 101.69, 52.7, 92.75, 43.2, 45.92, 280.28, 51.11]"
  :rpc-data="[44.23, 42.9, 46.26, 54.52, 42.38, 44.16, 42.21, 40.55, 214.7, 44.62]"
  y-axis-label="Mean Latency (ms)"
/>

### P95 Latency by Method

<LatencyChart
  title="P95 Latency by Method"
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :wrapper-data="[65.64, 56.93, 153.64, 123.64, 62.38, 134.47, 47.64, 51.98, 347.17, 65.73]"
  :rpc-data="[58.61, 47.17, 61.84, 77.6, 48.64, 60.34, 51.6, 45.47, 275.3, 52.73]"
  y-axis-label="P95 Latency (ms)"
/>

### Relative Performance (Speedup)

<SpeedupChart
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :speedups="[1.08, 0.88, 0.48, 0.54, 0.8, 0.48, 0.98, 0.88, 0.77, 0.87]"
/>

### Batch Size Scaling

The wrapper excels at large batch requests due to Portal's efficient data retrieval.

<BatchChart
  title="eth_blockNumber: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 1000, 10000]"
  :wrapper-data="[47.27, 41.86, 41.85, 42.13, 47.46, 56.22]"
  :rpc-data="[43.47, 49.75, 50.1, 55.13, 231.21, 2563.68]"
/>

<BatchChart
  title="eth_getBlockByNumber: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 100]"
  :wrapper-data="[102.55, 86.67, 88.65, 89.69, 98.06]"
  :rpc-data="[45.01, 53.24, 59.2, 74.35, 100.78]"
/>

<BatchChart
  title="eth_getLogs: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 100]"
  :wrapper-data="[55.88, 55.32, 52.27, 54.87, 62.73]"
  :rpc-data="[45.39, 55.74, 63.74, 61.72, 88.2]"
/>


## Run Parameters

- rpc_url: `https://base-mainnet.g.alchemy.com/v2/hLOW08JLy4YPql5tUXsp6XtM2qezg0RP`
- wrapper_url: `http://localhost:8080/v1/evm/8453`
- chain_id: 8453
- iterations: 10
- concurrency: 1
- delay_ms: 50
- timeout_ms: 60000
- batch_sizes: 1,5,10,25,1000,10000
- batch_sizes_heavy: 1,5,10,25,100
- batch_methods: eth_blockNumber,eth_getBlockByNumber,eth_getLogs
- bench_methods: eth_blockNumber,eth_getBlockByNumber,eth_getBlockByHash,eth_getTransactionByHash,eth_getTransactionReceipt,eth_getTransactionByBlockNumberAndIndex,eth_getLogs,trace_block,trace_transaction
- batch_chunk_size: 1000
- retries: 2

## Single Request Results

| target | method | ok | errors | mean ms | p95 ms | request bytes |
| --- | --- | --- | --- | --- | --- | --- |
| wrapper | eth_blockNumber | 10 | 0 | 41.1 | 65.64 | 63 |
| rpc | eth_blockNumber | 10 | 0 | 44.23 | 58.61 | 63 |
| wrapper | eth_getBlockByHash | 10 | 0 | 48.97 | 56.93 | 140 |
| rpc | eth_getBlockByHash | 10 | 0 | 42.9 | 47.17 | 140 |
| wrapper | eth_getBlockByNumber(fullTx=false) | 10 | 0 | 96.93 | 153.64 | 85 |
| rpc | eth_getBlockByNumber(fullTx=false) | 10 | 0 | 46.26 | 61.84 | 85 |
| wrapper | eth_getBlockByNumber(fullTx=true) | 10 | 0 | 101.69 | 123.64 | 84 |
| rpc | eth_getBlockByNumber(fullTx=true) | 10 | 0 | 54.52 | 77.6 | 84 |
| wrapper | eth_getLogs | 10 | 0 | 52.7 | 62.38 | 241 |
| rpc | eth_getLogs | 10 | 0 | 42.38 | 48.64 | 241 |
| wrapper | eth_getTransactionByBlockNumberAndIndex | 10 | 0 | 92.75 | 134.47 | 104 |
| rpc | eth_getTransactionByBlockNumberAndIndex | 10 | 0 | 44.16 | 60.34 | 104 |
| wrapper | eth_getTransactionByHash | 10 | 0 | 43.2 | 47.64 | 140 |
| rpc | eth_getTransactionByHash | 10 | 0 | 42.21 | 51.6 | 140 |
| wrapper | eth_getTransactionReceipt | 10 | 0 | 45.92 | 51.98 | 141 |
| rpc | eth_getTransactionReceipt | 10 | 0 | 40.55 | 45.47 | 141 |
| wrapper | trace_block | 10 | 0 | 280.28 | 347.17 | 70 |
| rpc | trace_block | 10 | 0 | 214.7 | 275.3 | 70 |
| wrapper | trace_transaction | 10 | 0 | 51.11 | 65.73 | 133 |
| rpc | trace_transaction | 10 | 0 | 44.62 | 52.73 | 133 |

## Batch Results

| target | method | batch size | ok | errors | mean ms | p95 ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wrapper | eth_blockNumber (batch=1) | 1 | 10 | 0 | 47.27 | 96.51 | 47.27 | 65 | 1 |
| rpc | eth_blockNumber (batch=1) | 1 | 10 | 0 | 43.47 | 47.67 | 43.47 | 65 | 1 |
| wrapper | eth_blockNumber (batch=5) | 5 | 50 | 0 | 41.86 | 44.63 | 8.37 | 321 | 1 |
| rpc | eth_blockNumber (batch=5) | 5 | 50 | 0 | 49.75 | 56 | 9.95 | 321 | 1 |
| wrapper | eth_blockNumber (batch=10) | 10 | 100 | 0 | 41.85 | 44.26 | 4.19 | 642 | 1 |
| rpc | eth_blockNumber (batch=10) | 10 | 100 | 0 | 50.1 | 62.82 | 5.01 | 642 | 1 |
| wrapper | eth_blockNumber (batch=25) | 25 | 250 | 0 | 42.13 | 44.45 | 1.69 | 1617 | 1 |
| rpc | eth_blockNumber (batch=25) | 25 | 250 | 0 | 55.13 | 75.4 | 2.21 | 1617 | 1 |
| wrapper | eth_blockNumber (batch=1000) | 1000 | 10000 | 0 | 47.46 | 54.49 | 0.05 | 65894 | 1 |
| rpc | eth_blockNumber (batch=1000) | 1000 | 10000 | 0 | 231.21 | 325.44 | 0.23 | 65894 | 1 |
| wrapper | eth_blockNumber (batch=10000) | 10000 | 100000 | 0 | 56.22 | 62.12 | 0.01 | 668895 | 1 |
| rpc | eth_blockNumber (batch=10000) | 10000 | 100000 | 0 | 2563.68 | 3695.65 | 0.26 | 668895 | 10 |
| wrapper | eth_getBlockByNumber (batch=1) | 1 | 10 | 0 | 102.55 | 247.48 | 102.55 | 87 | 1 |
| rpc | eth_getBlockByNumber (batch=1) | 1 | 10 | 0 | 45.01 | 48.42 | 45.01 | 87 | 1 |
| wrapper | eth_getBlockByNumber (batch=5) | 5 | 50 | 0 | 86.67 | 91.18 | 17.33 | 431 | 1 |
| rpc | eth_getBlockByNumber (batch=5) | 5 | 50 | 0 | 53.24 | 62.14 | 10.65 | 431 | 1 |
| wrapper | eth_getBlockByNumber (batch=10) | 10 | 100 | 0 | 88.65 | 99.11 | 8.87 | 862 | 1 |
| rpc | eth_getBlockByNumber (batch=10) | 10 | 100 | 0 | 59.2 | 82.39 | 5.92 | 862 | 1 |
| wrapper | eth_getBlockByNumber (batch=25) | 25 | 250 | 0 | 89.69 | 100.13 | 3.59 | 2167 | 1 |
| rpc | eth_getBlockByNumber (batch=25) | 25 | 250 | 0 | 74.35 | 140.68 | 2.97 | 2167 | 1 |
| wrapper | eth_getBlockByNumber (batch=100) | 100 | 1000 | 0 | 98.06 | 103.67 | 0.98 | 8693 | 1 |
| rpc | eth_getBlockByNumber (batch=100) | 100 | 1000 | 0 | 100.78 | 184.82 | 1.01 | 8693 | 1 |
| wrapper | eth_getLogs (batch=1) | 1 | 10 | 0 | 55.88 | 60.55 | 55.88 | 243 | 1 |
| rpc | eth_getLogs (batch=1) | 1 | 10 | 0 | 45.39 | 53.46 | 45.39 | 243 | 1 |
| wrapper | eth_getLogs (batch=5) | 5 | 50 | 0 | 55.32 | 65.42 | 11.06 | 1211 | 1 |
| rpc | eth_getLogs (batch=5) | 5 | 50 | 0 | 55.74 | 95.03 | 11.15 | 1211 | 1 |
| wrapper | eth_getLogs (batch=10) | 10 | 100 | 0 | 52.27 | 55.05 | 5.23 | 2422 | 1 |
| rpc | eth_getLogs (batch=10) | 10 | 100 | 0 | 63.74 | 135.62 | 6.37 | 2422 | 1 |
| wrapper | eth_getLogs (batch=25) | 25 | 250 | 0 | 54.87 | 73.3 | 2.19 | 6067 | 1 |
| rpc | eth_getLogs (batch=25) | 25 | 250 | 0 | 61.72 | 76.3 | 2.47 | 6067 | 1 |
| wrapper | eth_getLogs (batch=100) | 100 | 1000 | 0 | 62.73 | 108.16 | 0.63 | 24293 | 1 |
| rpc | eth_getLogs (batch=100) | 100 | 1000 | 0 | 88.2 | 149.14 | 0.88 | 24293 | 1 |

## Graphs (mean ms)

```
eth_blockNumber
  wrapper    41.10 |##############################  |
  rpc        44.23 |################################|
eth_getBlockByHash
  wrapper    48.97 |################################|
  rpc        42.90 |############################    |
eth_getBlockByNumber(fullTx=false)
  wrapper    96.93 |################################|
  rpc        46.26 |###############                 |
eth_getBlockByNumber(fullTx=true)
  wrapper    101.69 |################################|
  rpc        54.52 |#################               |
eth_getLogs
  wrapper    52.70 |################################|
  rpc        42.38 |##########################      |
eth_getTransactionByBlockNumberAndIndex
  wrapper    92.75 |################################|
  rpc        44.16 |###############                 |
eth_getTransactionByHash
  wrapper    43.20 |################################|
  rpc        42.21 |############################### |
eth_getTransactionReceipt
  wrapper    45.92 |################################|
  rpc        40.55 |############################    |
trace_block
  wrapper    280.28 |################################|
  rpc        214.70 |#########################       |
trace_transaction
  wrapper    51.11 |################################|
  rpc        44.62 |############################    |

Batch: eth_blockNumber
  size=1
    wrapper    47.27 |################################|
    rpc        43.47 |#############################   |
  size=5
    wrapper    41.86 |###########################     |
    rpc        49.75 |################################|
  size=10
    wrapper    41.85 |###########################     |
    rpc        50.10 |################################|
  size=25
    wrapper    42.13 |########################        |
    rpc        55.13 |################################|
  size=1000
    wrapper    47.46 |#######                         |
    rpc        231.21 |################################|
  size=10000
    wrapper    56.22 |#                               |
    rpc        2563.68 |################################|

Batch: eth_getBlockByNumber
  size=1
    wrapper    102.55 |################################|
    rpc        45.01 |##############                  |
  size=5
    wrapper    86.67 |################################|
    rpc        53.24 |####################            |
  size=10
    wrapper    88.65 |################################|
    rpc        59.20 |#####################           |
  size=25
    wrapper    89.69 |################################|
    rpc        74.35 |###########################     |
  size=100
    wrapper    98.06 |############################### |
    rpc        100.78 |################################|

Batch: eth_getLogs
  size=1
    wrapper    55.88 |################################|
    rpc        45.39 |##########################      |
  size=5
    wrapper    55.32 |################################|
    rpc        55.74 |################################|
  size=10
    wrapper    52.27 |##########################      |
    rpc        63.74 |################################|
  size=25
    wrapper    54.87 |############################    |
    rpc        61.72 |################################|
  size=100
    wrapper    62.73 |#######################         |
    rpc        88.20 |################################|

```

## Graphs (p95 ms)

```
eth_blockNumber
  wrapper    65.64 |################################|
  rpc        58.61 |#############################   |
eth_getBlockByHash
  wrapper    56.93 |################################|
  rpc        47.17 |###########################     |
eth_getBlockByNumber(fullTx=false)
  wrapper    153.64 |################################|
  rpc        61.84 |#############                   |
eth_getBlockByNumber(fullTx=true)
  wrapper    123.64 |################################|
  rpc        77.60 |####################            |
eth_getLogs
  wrapper    62.38 |################################|
  rpc        48.64 |#########################       |
eth_getTransactionByBlockNumberAndIndex
  wrapper    134.47 |################################|
  rpc        60.34 |##############                  |
eth_getTransactionByHash
  wrapper    47.64 |##############################  |
  rpc        51.60 |################################|
eth_getTransactionReceipt
  wrapper    51.98 |################################|
  rpc        45.47 |############################    |
trace_block
  wrapper    347.17 |################################|
  rpc        275.30 |#########################       |
trace_transaction
  wrapper    65.73 |################################|
  rpc        52.73 |##########################      |
```