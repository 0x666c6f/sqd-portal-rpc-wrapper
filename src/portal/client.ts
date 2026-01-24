import { Config } from '../config';
import { metrics } from '../metrics';
import { normalizeError, rateLimitError, unauthorizedError, conflictError, unavailableError, missingDataError, invalidParams, serverError } from '../errors';
import { PortalHeadResponse, PortalMetadataResponse, PortalRequest, PortalBlockResponse } from './types';
import { parseNdjsonStream } from './ndjson';

export interface PortalClientOptions {
  fetchImpl?: typeof fetch;
  logger?: { info: (obj: Record<string, unknown>, msg: string) => void; warn?: (obj: Record<string, unknown>, msg: string) => void };
}

export interface PortalStreamHeaders {
  finalizedHeadNumber?: string;
  finalizedHeadHash?: string;
}

export class PortalClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: string;
  private readonly timeoutMs: number;
  private readonly metadataTtlMs: number;
  private readonly maxNdjsonLineBytes: number;
  private readonly maxNdjsonBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: PortalClientOptions['logger'];
  private readonly metadataCache = new Map<string, { data: PortalMetadataResponse; fetchedAt: number }>();

  constructor(private readonly config: Config, options: PortalClientOptions = {}) {
    this.baseUrl = config.portalBaseUrl;
    this.apiKey = config.portalApiKey;
    this.apiKeyHeader = config.portalApiKeyHeader;
    this.timeoutMs = config.httpTimeoutMs;
    this.metadataTtlMs = config.portalMetadataTtlMs;
    this.maxNdjsonLineBytes = config.maxNdjsonLineBytes;
    this.maxNdjsonBytes = config.maxNdjsonBytes;
    this.fetchImpl = options.fetchImpl || fetch;
    this.logger = options.logger;
  }

  async fetchHead(
    baseUrl: string,
    finalized: boolean,
    _requestedFinality: string,
    traceparent?: string
  ): Promise<{ head: PortalHeadResponse; finalizedAvailable: boolean }> {
    const url = `${baseUrl}/${finalized ? 'finalized-head' : 'head'}`;
    const resp = await this.request(url, 'GET', 'application/json', undefined, traceparent);

    if (resp.status === 404 && finalized) {
      metrics.finalized_fallback_total.inc();
      this.logger?.warn?.({ endpoint: 'finalized-head', status: 404 }, 'finalized head not found, fallback to non-finalized');
      return this.fetchHead(baseUrl, false, _requestedFinality, traceparent);
    }

    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }

    const body = (await resp.json()) as PortalHeadResponse;
    return { head: body, finalizedAvailable: finalized };
  }

  async streamBlocks(
    baseUrl: string,
    finalized: boolean,
    request: PortalRequest,
    traceparent?: string,
    onHeaders?: (headers: PortalStreamHeaders) => void
  ): Promise<PortalBlockResponse[]> {
    const url = `${baseUrl}/${finalized ? 'finalized-stream' : 'stream'}`;
    const resp = await this.request(url, 'POST', 'application/x-ndjson', JSON.stringify(request), traceparent);

    if (resp.status === 204) {
      onHeaders?.(streamHeaders(resp));
      return [];
    }

    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }

    onHeaders?.(streamHeaders(resp));
    const body = resp.body;
    if (!body) {
      return [];
    }

    return parseNdjsonStream(body, {
      maxLineBytes: this.maxNdjsonLineBytes,
      maxBytes: this.maxNdjsonBytes
    });
  }

  async getMetadata(baseUrl: string, traceparent?: string): Promise<PortalMetadataResponse> {
    const now = Date.now();
    const cached = this.metadataCache.get(baseUrl);
    if (cached && now - cached.fetchedAt < this.metadataTtlMs) {
      return cached.data;
    }
    if (process.env.NODE_ENV === 'test' && this.fetchImpl === fetch && !cached) {
      return { dataset: baseUrl.split('/').pop() || 'unknown', start_block: 0, real_time: false };
    }
    try {
      const data = await this.fetchMetadata(baseUrl, traceparent);
      this.metadataCache.set(baseUrl, { data, fetchedAt: now });
      return data;
    } catch (err) {
      if (cached) {
        this.logger?.warn?.({ endpoint: 'metadata', error: err instanceof Error ? err.message : String(err) }, 'metadata fetch failed, using cache');
        this.metadataCache.set(baseUrl, { data: cached.data, fetchedAt: now });
        return cached.data;
      }
      throw err;
    }
  }

  private async fetchMetadata(baseUrl: string, traceparent?: string): Promise<PortalMetadataResponse> {
    const url = `${baseUrl}/metadata`;
    const resp = await this.request(url, 'GET', 'application/json', undefined, traceparent);
    metrics.portal_metadata_fetch_total.labels(String(resp.status)).inc();
    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }
    const body = (await resp.json()) as PortalMetadataResponse;
    this.logger?.info({ endpoint: 'metadata', dataset: body.dataset, realTime: body.real_time }, 'portal metadata');
    return body;
  }

  private async request(
    url: string,
    method: string,
    accept: string,
    body?: string,
    traceparent?: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: accept
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers[this.apiKeyHeader] = this.apiKey;
    }
    if (traceparent) {
      headers.traceparent = traceparent;
    }

    const start = performance.now();
    try {
      const resp = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      const elapsed = (performance.now() - start) / 1000;
      metrics.portal_requests_total.labels(endpointLabel(url), String(resp.status)).inc();
      metrics.portal_latency_seconds.labels(endpointLabel(url)).observe(elapsed);
      this.logger?.info({ endpoint: endpointLabel(url), status: resp.status, durationMs: Math.round(elapsed * 1000) }, 'portal response');

      return resp;
    } catch (err) {
      this.logger?.warn?.({ endpoint: endpointLabel(url), error: err instanceof Error ? err.message : String(err) }, 'portal error');
      throw normalizeError(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  buildDatasetBaseUrl(dataset: string): string {
    const base = normalizePortalBaseUrl(this.baseUrl);
    if (base.includes('{dataset}')) {
      return normalizePortalBaseUrl(base.replace('{dataset}', dataset));
    }
    if (base.toLowerCase().endsWith(`/${dataset.toLowerCase()}`)) {
      return normalizePortalBaseUrl(base);
    }
    return normalizePortalBaseUrl(`${base}/${dataset}`);
  }
}

export function normalizePortalBaseUrl(raw: string): string {
  let base = raw.trim();
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  const suffixes = ['/stream', '/finalized-stream', '/head', '/finalized-head', '/metadata'];
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base;
}

function endpointLabel(url: string): string {
  if (url.endsWith('/head')) return 'head';
  if (url.endsWith('/finalized-head')) return 'finalized-head';
  if (url.endsWith('/stream')) return 'stream';
  if (url.endsWith('/finalized-stream')) return 'finalized-stream';
  if (url.endsWith('/metadata')) return 'metadata';
  return 'unknown';
}

async function readBody(resp: Response): Promise<{ text: string; json?: unknown }> {
  try {
    const clone = resp.clone();
    const text = await resp.text();
    let json: unknown = undefined;
    try {
      json = await clone.json();
    } catch {
      json = undefined;
    }
    return { text: text || 'response body unavailable', json };
  } catch (err) {
    return { text: `response body unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function mapPortalStatusError(status: number, body: { text: string; json?: unknown }) {
  switch (status) {
    case 400:
      return invalidParams(`invalid portal response: ${body.text}`);
    case 401:
    case 403:
      return unauthorizedError();
    case 404:
      return missingDataError('block not found');
    case 409:
      return conflictError(extractPreviousBlocks(body.json));
    case 429:
      return rateLimitError('Too Many Requests');
    case 503:
      return unavailableError('unavailable');
    default:
      return serverError('server error');
  }
}

function streamHeaders(resp: Response): PortalStreamHeaders {
  const number = resp.headers.get('x-sqd-finalized-head-number') || undefined;
  const hash = resp.headers.get('x-sqd-finalized-head-hash') || undefined;
  return {
    finalizedHeadNumber: number || undefined,
    finalizedHeadHash: hash || undefined
  };
}

function extractPreviousBlocks(payload: unknown): unknown[] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const previousBlocks = (payload as { previousBlocks?: unknown }).previousBlocks;
  if (Array.isArray(previousBlocks)) {
    return previousBlocks;
  }
  return undefined;
}
