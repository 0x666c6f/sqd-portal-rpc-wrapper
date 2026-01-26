import { Counter, Gauge, Histogram, collectDefaultMetrics, Registry } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const metrics = {
  requests_total: new Counter({
    name: 'requests_total',
    help: 'Total JSON-RPC requests',
    labelNames: ['method', 'chainId', 'status'] as const,
    registers: [registry]
  }),
  portal_requests_total: new Counter({
    name: 'portal_requests_total',
    help: 'Total portal requests',
    labelNames: ['endpoint', 'status'] as const,
    registers: [registry]
  }),
  portal_latency_seconds: new Histogram({
    name: 'portal_latency_seconds',
    help: 'Portal request latency in seconds',
    labelNames: ['endpoint'] as const,
    registers: [registry],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
  }),
  portal_metadata_fetch_total: new Counter({
    name: 'portal_metadata_fetch_total',
    help: 'Total portal metadata fetches',
    labelNames: ['status'] as const,
    registers: [registry]
  }),
  portal_conflict_total: new Counter({
    name: 'portal_conflict_total',
    help: 'Total portal conflict responses',
    labelNames: ['chainId'] as const,
    registers: [registry]
  }),
  portal_realtime_enabled: new Gauge({
    name: 'portal_realtime_enabled',
    help: 'Portal realtime enabled flag',
    labelNames: ['chainId'] as const,
    registers: [registry]
  }),
  upstream_requests_total: new Counter({
    name: 'upstream_requests_total',
    help: 'Total upstream JSON-RPC requests',
    labelNames: ['status'] as const,
    registers: [registry]
  }),
  upstream_latency_seconds: new Histogram({
    name: 'upstream_latency_seconds',
    help: 'Upstream request latency in seconds',
    labelNames: ['endpoint'] as const,
    registers: [registry],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
  }),
  rpc_duration_seconds: new Histogram({
    name: 'rpc_duration_seconds',
    help: 'JSON-RPC handler duration in seconds',
    labelNames: ['method'] as const,
    registers: [registry],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
  }),
  rpc_timeouts_total: new Counter({
    name: 'rpc_timeouts_total',
    help: 'Total JSON-RPC handler timeouts',
    labelNames: ['method'] as const,
    registers: [registry]
  }),
  batch_requests_total: new Counter({
    name: 'batch_requests_total',
    help: 'Total JSON-RPC batch requests',
    labelNames: ['count'] as const,
    registers: [registry]
  }),
  batch_items_total: new Counter({
    name: 'batch_items_total',
    help: 'Total JSON-RPC batch items',
    labelNames: ['status'] as const,
    registers: [registry]
  }),
  ndjson_lines_total: new Counter({
    name: 'ndjson_lines_total',
    help: 'Total NDJSON lines parsed',
    registers: [registry]
  }),
  ndjson_bytes_total: new Counter({
    name: 'ndjson_bytes_total',
    help: 'Total NDJSON bytes parsed',
    registers: [registry]
  }),
  response_bytes_total: new Counter({
    name: 'response_bytes_total',
    help: 'Total bytes in JSON-RPC responses',
    labelNames: ['method', 'chainId'] as const,
    registers: [registry]
  }),
  portal_unsupported_fields_total: new Counter({
    name: 'portal_unsupported_fields_total',
    help: 'Total portal unsupported field responses',
    labelNames: ['field'] as const,
    registers: [registry]
  }),
  rate_limit_total: new Counter({
    name: 'rate_limit_total',
    help: 'Total rate limit errors by source',
    labelNames: ['source'] as const,
    registers: [registry]
  }),
  errors_total: new Counter({
    name: 'errors_total',
    help: 'Total errors by category',
    labelNames: ['category'] as const,
    registers: [registry]
  }),
  finalized_fallback_total: new Counter({
    name: 'finalized_fallback_total',
    help: 'Total finalized endpoint fallbacks',
    registers: [registry]
  })
};

export async function metricsPayload(): Promise<string> {
  return registry.metrics();
}
