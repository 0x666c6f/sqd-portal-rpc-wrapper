import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { coalesceBatchRequests } from '../src/rpc/batch';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import type { PortalClient } from '../src/portal/client';
import { makeBlock, makePortal } from './batch.helpers';

describe('coalesceBatchRequests (block)', () => {
  it('returns empty when dataset is unresolved', async () => {
    const config = loadConfig({ SERVICE_MODE: 'multi', PORTAL_USE_DEFAULT_DATASETS: 'false' });
    const results = await coalesceBatchRequests([], {
      config,
      portal: {} as PortalClient,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.size).toBe(0);
  });

  it('skips coalescing on metadata error', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      getMetadata: async () => {
        throw new Error('boom');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.size).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('records invalid params and skips pending', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: { bad: true } } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['pending'] } },
      { request: { jsonrpc: '2.0', id: 4, method: 'eth_getBlockByNumber', params: ['0x1', 'nope'] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params for eth_getBlockByNumber');
    expect(results.get(1)?.response.error?.message).toBe('invalid params');
    expect(results.has(2)).toBe(false);
    expect(results.get(3)?.response.error?.message).toBe('invalid params');
  });

  it('returns invalid block error when block tag is malformed', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0xzz', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns invalid block error when fetchHead throws non-rpc error', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      fetchHead: async () => {
        throw new Error('boom');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns null below start_block and handles stream errors', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 10 }),
      streamBlocks: async () => {
        throw new Error('stream down');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0xa', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.get(0)?.response.result).toBeNull();
    expect(results.has(1)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('ignores non-numeric start_block metadata', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 'nope' })
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('coalesces contiguous blocks, caches tags, and fills missing block with null', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchHead = vi.fn(async () => ({
      head: { number: 5, hash: '0x' + '11'.repeat(32) },
      finalizedAvailable: true
    }));
    const streamBlocks = vi.fn(async (_base: string, useFinalized: boolean, req: { fromBlock: number; toBlock: number }) => {
      if (useFinalized) {
        return [makeBlock(req.fromBlock, true)];
      }
      return [makeBlock(5)];
    });
    const portal = makePortal({ fetchHead, streamBlocks });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['latest', false] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: [6, false] } },
      { request: { jsonrpc: '2.0', id: 4, method: 'eth_getBlockByNumber', params: ['finalized', true] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(fetchHead).toHaveBeenCalledTimes(2);
    expect(results.get(2)?.response.result).toBeNull();
    expect(results.get(3)?.response.result).toBeTruthy();
  });

  it('coalesces contiguous segments across gaps', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        const blocks = [];
        for (let n = req.fromBlock; n <= req.toBlock; n += 1) {
          blocks.push(makeBlock(n));
        }
        return blocks;
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x6', false] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['0x8', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toEqual([
      { fromBlock: 5, toBlock: 6 },
      { fromBlock: 8, toBlock: 8 }
    ]);
    expect(results.get(0)?.response.result).toBeTruthy();
    expect(results.get(1)?.response.result).toBeTruthy();
    expect(results.get(2)?.response.result).toBeTruthy();
  });

  it('reuses full transaction stream for hash-only blocks', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fullTx: boolean }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fields: { transaction: Record<string, boolean> } }) => {
        calls.push({ fullTx: Boolean(req.fields.transaction.input) });
        return [makeBlock(5, true)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', true] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x5', false] } }
    ];
    const results = await coalesceBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fullTx).toBe(true);
    const hashOnly = results.get(1)?.response.result as { transactions?: string[] };
    expect(hashOnly.transactions).toEqual(['0xtx5']);
  });
});
