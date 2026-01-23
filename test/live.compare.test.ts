import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { loadConfig } from '../src/config';

const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

const BASE_RPC_URL = process.env.LIVE_BASE_RPC_URL || 'https://base.llamarpc.com';
const PORTAL_BASE_URL = process.env.LIVE_PORTAL_BASE_URL || 'https://portal.sqd.dev/datasets';
const CHAIN_ID = Number.parseInt(process.env.LIVE_CHAIN_ID || '8453', 10);
const BLOCK_OFFSET = Number.parseInt(process.env.LIVE_BLOCK_OFFSET || '10', 10);
const SEARCH_DEPTH = Number.parseInt(process.env.LIVE_BLOCK_SEARCH_DEPTH || '200', 10);
const MATCH_ATTEMPTS = Number.parseInt(process.env.LIVE_BLOCK_MATCH_ATTEMPTS || '6', 10);
const MATCH_DELAY_MS = Number.parseInt(process.env.LIVE_BLOCK_MATCH_DELAY_MS || '1500', 10);
const RPC_TIMEOUT_MS = Number.parseInt(process.env.LIVE_RPC_TIMEOUT_MS || '30000', 10);

let wrapperUrl = '';
let server: Awaited<ReturnType<typeof buildServer>> | null = null;
let targetBlock = 0;
let txIndex = 0;

describeLive('live rpc parity', () => {
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'error';
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_BASE_URL: PORTAL_BASE_URL
    });
    server = await buildServer(config);
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    const baseUrl =
      typeof address === 'string' ? address : `http://127.0.0.1:${(address as { port: number }).port}`;
    wrapperUrl = `${baseUrl}/v1/evm/${CHAIN_ID}`;

    const baseChainId = await rpcResult(BASE_RPC_URL, 'eth_chainId', []);
    if (parseHexQuantity(baseChainId) !== CHAIN_ID) {
      throw new Error(`base rpc chainId mismatch: got ${baseChainId}`);
    }

    const envBlock = process.env.LIVE_BLOCK_NUMBER;
    if (envBlock) {
      targetBlock = parseHexQuantity(envBlock);
    } else {
      const matched = await waitForBlockNumberMatch(BASE_RPC_URL, wrapperUrl);
      targetBlock = Math.max(0, matched - BLOCK_OFFSET);
    }

    const envTxIndex = process.env.LIVE_TX_INDEX;
    if (envTxIndex) {
      txIndex = parseHexQuantity(envTxIndex);
      return;
    }

    const legacy = await findLegacyTx(BASE_RPC_URL, targetBlock, SEARCH_DEPTH);
    targetBlock = legacy.blockNumber;
    txIndex = legacy.txIndex;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('eth_chainId', async () => {
    const base = await rpcResult(BASE_RPC_URL, 'eth_chainId', []);
    const wrapper = await rpcResult(wrapperUrl, 'eth_chainId', []);
    expect(wrapper).toEqual(base);
  });

  it('eth_blockNumber', async () => {
    const matched = await waitForBlockNumberMatch(BASE_RPC_URL, wrapperUrl);
    const wrapper = await rpcResult(wrapperUrl, 'eth_blockNumber', []);
    expect(parseHexQuantity(wrapper)).toBe(matched);
  });

  it('eth_getBlockByNumber', async () => {
    const blockHex = toHex(targetBlock);
    const base = await rpcResult(BASE_RPC_URL, 'eth_getBlockByNumber', [blockHex, false]);
    const wrapper = await rpcResult(wrapperUrl, 'eth_getBlockByNumber', [blockHex, false]);
    expect(wrapper).toEqual(base);
  });

  it('eth_getTransactionByBlockNumberAndIndex', async () => {
    const blockHex = toHex(targetBlock);
    const txHex = toHex(txIndex);
    const base = await rpcResult(BASE_RPC_URL, 'eth_getTransactionByBlockNumberAndIndex', [blockHex, txHex]);
    const wrapper = await rpcResult(wrapperUrl, 'eth_getTransactionByBlockNumberAndIndex', [blockHex, txHex]);
    expect(wrapper).toEqual(base);
  });

  it('eth_getLogs', async () => {
    const blockHex = toHex(targetBlock);
    const baseLogs = await rpcResult(BASE_RPC_URL, 'eth_getLogs', [{ fromBlock: blockHex, toBlock: blockHex }]);
    let filter: Record<string, unknown> = { fromBlock: blockHex, toBlock: blockHex };
    if (Array.isArray(baseLogs) && baseLogs.length > 0) {
      const addr = baseLogs[0]?.address as string | undefined;
      if (addr) {
        filter = { ...filter, address: addr };
      }
    }
    const base = await rpcResult(BASE_RPC_URL, 'eth_getLogs', [filter]);
    const wrapper = await rpcResult(wrapperUrl, 'eth_getLogs', [filter]);
    expect(wrapper).toEqual(base);
  });

  it('trace_block', async () => {
    const blockHex = toHex(targetBlock);
    const base = await rpcResult(BASE_RPC_URL, 'trace_block', [blockHex]);
    const wrapper = await rpcResult(wrapperUrl, 'trace_block', [blockHex]);
    expect(wrapper).toEqual(base);
  });
});

async function jsonRpcCall(
  url: string,
  method: string,
  params: unknown[]
): Promise<{ status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function rpcResult(url: string, method: string, params: unknown[]) {
  const { status, body } = await jsonRpcCall(url, method, params);
  if (status >= 400) {
    throw new Error(`rpc http ${status} for ${method}`);
  }
  if (body.error) {
    const err = body.error as { code?: number; message?: string };
    throw new Error(`rpc error ${err.code ?? 'unknown'} for ${method}: ${err.message ?? 'unknown'}`);
  }
  return body.result;
}

function parseHexQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x')) {
      return Number.parseInt(trimmed.slice(2) || '0', 16);
    }
    return Number.parseInt(trimmed, 10);
  }
  throw new Error(`invalid quantity: ${String(value)}`);
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

async function waitForBlockNumberMatch(baseUrl: string, wrapper: string): Promise<number> {
  let lastBase = 0;
  let lastWrapper = 0;
  for (let attempt = 0; attempt < MATCH_ATTEMPTS; attempt += 1) {
    const [baseHex, wrapperHex] = await Promise.all([
      rpcResult(baseUrl, 'eth_blockNumber', []),
      rpcResult(wrapper, 'eth_blockNumber', [])
    ]);
    lastBase = parseHexQuantity(baseHex);
    lastWrapper = parseHexQuantity(wrapperHex);
    if (lastBase === lastWrapper) {
      return lastBase;
    }
    await sleep(MATCH_DELAY_MS);
  }
  throw new Error(`block numbers diverged: base=${lastBase} wrapper=${lastWrapper}`);
}

async function findLegacyTx(
  baseUrl: string,
  startBlock: number,
  depth: number
): Promise<{ blockNumber: number; txIndex: number }> {
  for (let offset = 0; offset <= depth; offset += 1) {
    const blockNumber = startBlock - offset;
    if (blockNumber < 0) break;
    const block = await rpcResult(baseUrl, 'eth_getBlockByNumber', [toHex(blockNumber), true]);
    if (!block || typeof block !== 'object') {
      continue;
    }
    const txs = (block as { transactions?: unknown[] }).transactions;
    if (!Array.isArray(txs) || txs.length === 0) {
      continue;
    }
    const idx = txs.findIndex((tx) => isLegacyTx(tx as Record<string, unknown>));
    if (idx >= 0) {
      return { blockNumber, txIndex: idx };
    }
  }
  throw new Error('no legacy tx found; set LIVE_BLOCK_NUMBER and LIVE_TX_INDEX');
}

function isLegacyTx(tx: Record<string, unknown>): boolean {
  const type = tx.type;
  if (typeof type === 'string') {
    const parsed = type.startsWith('0x') ? Number.parseInt(type.slice(2) || '0', 16) : Number.parseInt(type, 10);
    return Number.isFinite(parsed) && parsed === 0;
  }
  if (typeof type === 'number') {
    return type === 0;
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
