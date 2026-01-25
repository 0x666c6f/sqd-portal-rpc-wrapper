import { performance } from 'node:perf_hooks';

const RPC_URL = process.env.RPC_URL || 'https://base.llamarpc.com';
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || '8453', 10);
const WRAPPER_URL =
  process.env.WRAPPER_URL || `http://localhost:8080/v1/evm/${CHAIN_ID}`;
const WRAPPER_HEADERS = parseJson(process.env.WRAPPER_HEADERS || '{}') as Record<string, string>;
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS || '25', 10);
const CONCURRENCY = Number.parseInt(process.env.BENCH_CONCURRENCY || '1', 10);
const TIMEOUT_MS = Number.parseInt(process.env.BENCH_TIMEOUT_MS || '8000', 10);
const BLOCK_OFFSET = Number.parseInt(process.env.BENCH_BLOCK_OFFSET || '1000', 10);
const SEARCH_DEPTH = Number.parseInt(process.env.BENCH_BLOCK_SEARCH_DEPTH || '5', 10);
const OUTPUT_JSON = process.argv.includes('--json');

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

const wrapperHeaders = buildWrapperHeaders(WRAPPER_URL, CHAIN_ID, WRAPPER_HEADERS);

const endpoints = {
  wrapper: { label: 'wrapper', url: WRAPPER_URL, headers: wrapperHeaders },
  rpc: { label: 'rpc', url: RPC_URL, headers: DEFAULT_HEADERS }
};

type RpcResponse = { result?: unknown; error?: { code?: number; message?: string } };

type BenchResult = {
  label: string;
  method: string;
  params: unknown[];
  ok: number;
  errors: number;
  durationsMs: number[];
  sampleError?: string;
};

async function main() {
  await assertChainId();

  const { blockHex, blockHash, txIndexHex, txHash } = await selectBlockAndTx();
  const logFilter = await selectLogFilter(blockHex);

  const methods: { name: string; params: unknown[] }[] = [
    { name: 'eth_chainId', params: [] },
    { name: 'eth_blockNumber', params: [] },
    { name: 'eth_getBlockByNumber', params: [blockHex, false] },
    { name: 'eth_getBlockByNumber', params: [blockHex, true] },
    { name: 'eth_getBlockByHash', params: [blockHash, false] },
    { name: 'eth_getTransactionByHash', params: [txHash] },
    { name: 'eth_getTransactionReceipt', params: [txHash] },
    { name: 'eth_getTransactionByBlockNumberAndIndex', params: [blockHex, txIndexHex] },
    { name: 'eth_getLogs', params: [logFilter] },
    { name: 'trace_block', params: [blockHex] },
    { name: 'trace_transaction', params: [txHash] }
  ];

  const results: BenchResult[] = [];
  for (const method of methods) {
    for (const endpoint of Object.values(endpoints)) {
      const result = await benchMethod(endpoint, method.name, method.params);
      results.push(result);
    }
  }

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(results.map(toSummary), null, 2));
    return;
  }

  printSummary(results);
}

function buildWrapperHeaders(url: string, chainId: number, extra: Record<string, string>) {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS, ...extra };
  if (!url.includes('/v1/evm/')) {
    headers['x-chain-id'] = headers['x-chain-id'] || String(chainId);
  }
  return headers;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function assertChainId() {
  const baseChainId = parseHexQuantity(await rpcResult(endpoints.rpc, 'eth_chainId', []));
  if (baseChainId !== CHAIN_ID) {
    throw new Error(`rpc chainId mismatch: got ${baseChainId}, expected ${CHAIN_ID}`);
  }
}

async function selectBlockAndTx() {
  const envBlock = process.env.BENCH_BLOCK_NUMBER;
  const envBlockHash = process.env.BENCH_BLOCK_HASH;
  const envTxHash = process.env.BENCH_TX_HASH;
  if (envBlock) {
    const blockHex = ensureHex(envBlock);
    const txIndexHex = process.env.BENCH_TX_INDEX ? ensureHex(process.env.BENCH_TX_INDEX) : '0x0';
    const block = (await rpcResult(endpoints.rpc, 'eth_getBlockByNumber', [blockHex, true])) as {
      hash?: string;
      transactions?: { transactionIndex?: string; hash?: string }[];
    } | null;
    const blockHash = envBlockHash || block?.hash || '0x' + '00'.repeat(32);
    const txHash = envTxHash || block?.transactions?.[0]?.hash || '0x' + '00'.repeat(32);
    return { blockHex, blockHash, txIndexHex, txHash };
  }

  const rpcHead = parseHexQuantity(await rpcResult(endpoints.rpc, 'eth_blockNumber', []));
  const wrapperHead = parseHexQuantity(await rpcResult(endpoints.wrapper, 'eth_blockNumber', []));
  const minHead = Math.min(rpcHead, wrapperHead);
  const start = Math.max(0, minHead - BLOCK_OFFSET);

  for (let i = 0; i <= SEARCH_DEPTH; i += 1) {
    const candidate = Math.max(0, start - i);
    const blockHex = toHex(candidate);
    const block = (await rpcResult(endpoints.rpc, 'eth_getBlockByNumber', [blockHex, true])) as {
      hash?: string;
      transactions?: { transactionIndex?: string; hash?: string }[];
    } | null;
    if (block && Array.isArray(block.transactions) && block.transactions.length > 0) {
      const txIndexHex = block.transactions[0]?.transactionIndex || '0x0';
      const txHash = block.transactions[0]?.hash || '0x' + '00'.repeat(32);
      const blockHash = block.hash || '0x' + '00'.repeat(32);
      return { blockHex, blockHash, txIndexHex, txHash };
    }
  }

  return {
    blockHex: toHex(start),
    blockHash: envBlockHash || '0x' + '00'.repeat(32),
    txIndexHex: '0x0',
    txHash: envTxHash || '0x' + '00'.repeat(32)
  };
}

async function selectLogFilter(blockHex: string) {
  const baseLogs = await rpcResult(endpoints.rpc, 'eth_getLogs', [{ fromBlock: blockHex, toBlock: blockHex }]);
  const filter: Record<string, unknown> = { fromBlock: blockHex, toBlock: blockHex };
  if (Array.isArray(baseLogs) && baseLogs.length > 0) {
    const first = baseLogs[0] as { address?: string; topics?: string[] };
    if (first.address) {
      filter.address = first.address;
    }
    if (first.topics && first.topics.length > 0) {
      filter.topics = [first.topics[0]];
    }
  }
  return filter;
}

async function benchMethod(
  endpoint: { label: string; url: string; headers: Record<string, string> },
  method: string,
  params: unknown[]
): Promise<BenchResult> {
  const durationsMs: number[] = [];
  let ok = 0;
  let errors = 0;
  let sampleError: string | undefined;

  const run = async () => {
    const start = performance.now();
    const result = await rpcCall(endpoint, method, params);
    const duration = performance.now() - start;
    durationsMs.push(duration);
    if ('error' in result) {
      errors += 1;
      if (!sampleError) {
        sampleError = typeof result.error?.message === 'string' ? result.error?.message : 'rpc error';
      }
    } else {
      ok += 1;
    }
  };

  await runPool(ITERATIONS, CONCURRENCY, run);

  return { label: endpoint.label, method, params, ok, errors, durationsMs, sampleError };
}

async function runPool(iterations: number, concurrency: number, task: () => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= iterations) {
        return;
      }
      await task();
    }
  });
  await Promise.all(workers);
}

async function rpcCall(
  endpoint: { url: string; headers: Record<string, string> },
  method: string,
  params: unknown[]
): Promise<RpcResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    const json = (await res.json()) as RpcResponse;
    return json;
  } catch (err) {
    return { error: { code: -1, message: err instanceof Error ? err.message : 'request failed' } };
  } finally {
    clearTimeout(timeout);
  }
}

async function rpcResult(endpoint: { url: string; headers: Record<string, string> }, method: string, params: unknown[]) {
  const res = await rpcCall(endpoint, method, params);
  if (res.error) {
    const msg = res.error.message || 'rpc error';
    throw new Error(`${endpoint.url} ${method} failed: ${msg}`);
  }
  return res.result;
}

function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

function ensureHex(value: string) {
  return value.startsWith('0x') ? value : `0x${Number.parseInt(value, 10).toString(16)}`;
}

function parseHexQuantity(value: unknown): number {
  if (typeof value !== 'string') {
    throw new Error('expected hex quantity');
  }
  return Number(BigInt(value));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0 };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: sum / values.length,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    p95: percentile(values, 95)
  };
}

function toSummary(result: BenchResult) {
  const s = stats(result.durationsMs);
  return {
    target: result.label,
    method: result.method,
    ok: result.ok,
    errors: result.errors,
    sampleError: result.sampleError || null,
    minMs: round(s.min),
    meanMs: round(s.mean),
    p50Ms: round(s.p50),
    p90Ms: round(s.p90),
    p95Ms: round(s.p95),
    maxMs: round(s.max)
  };
}

function printSummary(results: BenchResult[]) {
  const grouped: Record<string, BenchResult[]> = {};
  for (const result of results) {
    grouped[result.method] = grouped[result.method] || [];
    grouped[result.method].push(result);
  }

  for (const [method, entries] of Object.entries(grouped)) {
    console.log(`\n${method}`);
    for (const entry of entries) {
      const s = stats(entry.durationsMs);
      const errorSuffix = entry.errors > 0 ? ` errors=${entry.errors} sample=${entry.sampleError || 'rpc error'}` : '';
      console.log(
        `  ${entry.label}: n=${entry.durationsMs.length} ok=${entry.ok} mean=${round(s.mean)}ms p50=${round(s.p50)}ms p95=${round(s.p95)}ms max=${round(s.max)}ms${errorSuffix}`
      );
    }
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
