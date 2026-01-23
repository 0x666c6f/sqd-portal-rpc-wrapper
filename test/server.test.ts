import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildServer } from '../src/server';
import { loadConfig } from '../src/config';

describe('server', () => {
  it('handles healthz', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('handles eth_chainId', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe('0x1');
    await server.close();
  });

  it('rejects missing chainId in multi mode', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_DATASET_MAP: '{"1":"ethereum-mainnet"}'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('requires wrapper api key', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      WRAPPER_API_KEY: 'secret'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it('skips response for notifications', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(204);
    await server.close();
  });

  it('rejects oversized gzip payload', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_REQUEST_BODY_BYTES: '20'
    });
    const server = await buildServer(config);
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
    const compressed = gzipSync(payload);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      payload: compressed
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32600);
    await server.close();
  });
});
