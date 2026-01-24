import { describe, expect, it, vi } from 'vitest';

describe('server rpc error handling', () => {
  it('normalizes non-rpc errors from request handler', async () => {
    vi.resetModules();
    vi.doMock('../src/jsonrpc', async () => {
      const actual = await vi.importActual<typeof import('../src/jsonrpc')>('../src/jsonrpc');
      return {
        ...actual,
        parseJsonRpcPayload: () => {
          throw new Error('boom');
        }
      };
    });

    const { buildServer } = await import('../src/server');
    const { loadConfig } = await import('../src/config');

    const server = await buildServer(
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET: 'ethereum-mainnet',
        PORTAL_CHAIN_ID: '1'
      })
    );

    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe(-32603);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/jsonrpc');
  });
});
