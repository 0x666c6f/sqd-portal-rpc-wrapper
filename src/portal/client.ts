import { Config } from '../config';
import { metrics } from '../metrics';
import {
  normalizeError,
  rateLimitError,
  unauthorizedError,
  conflictError,
  unavailableError,
  missingDataError,
  invalidParams,
  portalUnsupportedFieldError,
  serverError
} from '../errors';
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
  private readonly metadataRefreshInFlight = new Map<string, Promise<void>>();
  private readonly unsupportedFieldsByBaseUrl = new Map<string, Set<string>>();
  private readonly breakerThreshold: number;
  private readonly breakerResetMs: number;
  private breakerFailures = 0;
  private breakerOpenUntil = 0;
  private breakerHalfOpen = false;

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
    this.breakerThreshold = config.portalCircuitBreakerThreshold;
    this.breakerResetMs = config.portalCircuitBreakerResetMs;
  }

  async fetchHead(
    baseUrl: string,
    finalized: boolean,
    traceparent?: string,
    requestId?: string
  ): Promise<{ head: PortalHeadResponse; finalizedAvailable: boolean }> {
    const url = `${baseUrl}/${finalized ? 'finalized-head' : 'head'}`;
    const resp = await this.request(url, 'GET', 'application/json', undefined, traceparent, requestId);

    if (resp.status === 404 && finalized) {
      metrics.finalized_fallback_total.inc();
      this.logger?.warn?.({ endpoint: 'finalized-head', status: 404 }, 'finalized head not found, fallback to non-finalized');
      return this.fetchHead(baseUrl, false, traceparent, requestId);
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
    onHeaders?: (headers: PortalStreamHeaders) => void,
    requestId?: string
  ): Promise<PortalBlockResponse[]> {
    const url = `${baseUrl}/${finalized ? 'finalized-stream' : 'stream'}`;
    const unsupportedFields = this.getUnsupportedFields(baseUrl);
    let effectiveRequest = applyUnsupportedFields(request, unsupportedFields);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const resp = await this.request(
        url,
        'POST',
        'application/x-ndjson',
        JSON.stringify(effectiveRequest),
        traceparent,
        requestId
      );

      if (resp.status === 404 && finalized) {
        metrics.finalized_fallback_total.inc();
        this.logger?.warn?.({ endpoint: 'finalized-stream', status: 404 }, 'finalized stream not found, fallback to non-finalized');
        return this.streamBlocks(baseUrl, false, effectiveRequest, traceparent, onHeaders, requestId);
      }

      if (resp.status === 204) {
        onHeaders?.(streamHeaders(resp));
        return [];
      }

      if (resp.status === 400) {
        const body = await readBody(resp);
        const unknownField = extractUnknownField(body.text);
        if (unknownField) {
          if (!isNegotiableField(unknownField)) {
            throw portalUnsupportedFieldError(unknownField);
          }
          if (!unsupportedFields.has(unknownField)) {
            unsupportedFields.add(unknownField);
            this.unsupportedFieldsByBaseUrl.set(baseUrl, unsupportedFields);
          }
          const nextRequest = applyUnsupportedFields(request, unsupportedFields);
          if (nextRequest !== effectiveRequest) {
            effectiveRequest = nextRequest;
            continue;
          }
        }
        throw mapPortalStatusError(resp.status, body);
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

    throw serverError('portal field negotiation failed');
  }

  async getMetadata(baseUrl: string, traceparent?: string, requestId?: string): Promise<PortalMetadataResponse> {
    const now = Date.now();
    const cached = this.metadataCache.get(baseUrl);
    if (cached) {
      const age = now - cached.fetchedAt;
      if (age < this.metadataTtlMs) {
        return cached.data;
      }
      this.refreshMetadata(baseUrl, traceparent, requestId);
      return cached.data;
    }

    const data = await this.fetchMetadata(baseUrl, traceparent, requestId);
    this.metadataCache.set(baseUrl, { data, fetchedAt: now });
    return data;
  }

  private async fetchMetadata(baseUrl: string, traceparent?: string, requestId?: string): Promise<PortalMetadataResponse> {
    const url = `${baseUrl}/metadata`;
    const resp = await this.request(url, 'GET', 'application/json', undefined, traceparent, requestId);
    metrics.portal_metadata_fetch_total.labels(String(resp.status)).inc();
    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }
    const body = (await resp.json()) as PortalMetadataResponse;
    this.logger?.info({ endpoint: 'metadata', dataset: body.dataset, realTime: body.real_time }, 'portal metadata');
    return body;
  }

  private refreshMetadata(baseUrl: string, traceparent?: string, requestId?: string) {
    if (this.metadataRefreshInFlight.has(baseUrl)) {
      return;
    }
    const refresh = this.fetchMetadata(baseUrl, traceparent, requestId)
      .then((data) => {
        this.metadataCache.set(baseUrl, { data, fetchedAt: Date.now() });
      })
      .catch((err) => {
        this.logger?.warn?.({ endpoint: 'metadata', error: err instanceof Error ? err.message : String(err) }, 'metadata refresh failed');
      })
      .finally(() => {
        this.metadataRefreshInFlight.delete(baseUrl);
      });
    this.metadataRefreshInFlight.set(baseUrl, refresh);
  }

  private async request(
    url: string,
    method: string,
    accept: string,
    body?: string,
    traceparent?: string,
    requestId?: string
  ): Promise<Response> {
    if (this.isBreakerOpen()) {
      this.logger?.warn?.({ endpoint: endpointLabel(url) }, 'portal circuit open');
      throw unavailableError('portal circuit open');
    }
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
    if (requestId) {
      headers['X-Request-Id'] = requestId;
    }

    const start = performance.now();
    try {
      const resp = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);
      const elapsed = (performance.now() - start) / 1000;
      this.recordBreaker(resp.status);
      metrics.portal_requests_total.labels(endpointLabel(url), String(resp.status)).inc();
      metrics.portal_latency_seconds.labels(endpointLabel(url)).observe(elapsed);
      this.logger?.info({ endpoint: endpointLabel(url), status: resp.status, durationMs: Math.round(elapsed * 1000) }, 'portal response');

      return resp;
    } catch (err) {
      clearTimeout(timeout);
      this.recordBreaker(0);
      this.logger?.warn?.({ endpoint: endpointLabel(url), error: err instanceof Error ? err.message : String(err) }, 'portal error');
      throw normalizeError(err);
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

  private getUnsupportedFields(baseUrl: string): Set<string> {
    const existing = this.unsupportedFieldsByBaseUrl.get(baseUrl);
    if (existing) {
      return existing;
    }
    const set = new Set<string>();
    this.unsupportedFieldsByBaseUrl.set(baseUrl, set);
    return set;
  }

  private isBreakerOpen(): boolean {
    if (this.breakerThreshold <= 0) {
      return false;
    }
    const now = Date.now();
    if (this.breakerOpenUntil === 0) {
      return false;
    }
    if (now < this.breakerOpenUntil) {
      return true;
    }
    this.breakerOpenUntil = 0;
    this.breakerHalfOpen = true;
    return false;
  }

  private recordBreaker(status: number) {
    if (this.breakerThreshold <= 0) {
      return;
    }
    if (this.breakerHalfOpen) {
      if (status >= 500 || status === 0) {
        this.breakerOpenUntil = Date.now() + this.breakerResetMs;
        this.breakerFailures = 0;
        this.breakerHalfOpen = false;
        return;
      }
      this.breakerFailures = 0;
      this.breakerHalfOpen = false;
      return;
    }
    if (status >= 500 || status === 0) {
      this.breakerFailures += 1;
      if (this.breakerFailures >= this.breakerThreshold) {
        this.breakerOpenUntil = Date.now() + this.breakerResetMs;
        this.breakerFailures = 0;
      }
      return;
    }
    this.breakerFailures = 0;
    this.breakerOpenUntil = 0;
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

async function readBody(resp: Response): Promise<{ text: string; json?: unknown; jsonError?: string }> {
  try {
    const text = await resp.text();
    let json: unknown = undefined;
    let jsonError: string | undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch (err) {
      json = undefined;
      jsonError = String(err);
    }
    const resolvedText = text || 'response body unavailable';
    const textWithParseError = jsonError ? `${resolvedText} (json parse error: ${jsonError})` : resolvedText;
    return { text: textWithParseError, json, jsonError };
  } catch (err) {
    return { text: `response body unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function extractUnknownField(text: string): string | undefined {
  const match = /unknown field `([^`]+)`/i.exec(text);
  return match?.[1];
}

const NEGOTIABLE_FIELDS = new Set(['authorizationList']);

function isNegotiableField(field: string): boolean {
  return NEGOTIABLE_FIELDS.has(field);
}

function applyUnsupportedFields(request: PortalRequest, unsupported: Set<string>): PortalRequest {
  if (!request.fields || unsupported.size === 0) {
    return request;
  }
  const { fields } = request;
  const block = filterFieldMap(fields.block, unsupported);
  const transaction = filterFieldMap(fields.transaction, unsupported);
  const log = filterFieldMap(fields.log, unsupported);
  const trace = filterFieldMap(fields.trace, unsupported);
  const stateDiff = filterFieldMap(fields.stateDiff, unsupported);

  const nextFields = compactFields({ block, transaction, log, trace, stateDiff });
  if (
    nextFields.block === fields.block &&
    nextFields.transaction === fields.transaction &&
    nextFields.log === fields.log &&
    nextFields.trace === fields.trace &&
    nextFields.stateDiff === fields.stateDiff
  ) {
    return request;
  }
  return { ...request, fields: Object.keys(nextFields).length > 0 ? nextFields : undefined };
}

function filterFieldMap(
  map: Record<string, boolean> | undefined,
  unsupported: Set<string>
): Record<string, boolean> | undefined {
  if (!map) {
    return undefined;
  }
  let changed = false;
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(map)) {
    if (unsupported.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  if (!changed) {
    return map;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function compactFields(fields: {
  block?: Record<string, boolean>;
  transaction?: Record<string, boolean>;
  log?: Record<string, boolean>;
  trace?: Record<string, boolean>;
  stateDiff?: Record<string, boolean>;
}) {
  const compacted: typeof fields = {};
  if (fields.block && Object.keys(fields.block).length > 0) compacted.block = fields.block;
  if (fields.transaction && Object.keys(fields.transaction).length > 0) compacted.transaction = fields.transaction;
  if (fields.log && Object.keys(fields.log).length > 0) compacted.log = fields.log;
  if (fields.trace && Object.keys(fields.trace).length > 0) compacted.trace = fields.trace;
  if (fields.stateDiff && Object.keys(fields.stateDiff).length > 0) compacted.stateDiff = fields.stateDiff;
  return compacted;
}

function mapPortalStatusError(status: number, body: { text: string; json?: unknown; jsonError?: string }) {
  switch (status) {
    case 400:
      return invalidParams(`invalid portal response: ${body.text}`, body.jsonError ? { jsonError: body.jsonError } : undefined);
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
