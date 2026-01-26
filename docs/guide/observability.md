# Observability

## Metrics

Prometheus metrics are exposed at `GET /metrics`. See the metrics list in
`/guide/architecture` for the full catalog.

## Grafana Dashboard

Import the dashboard JSON from:

```
/grafana/sqd-portal-wrapper.json
```

The dashboard expects a Prometheus datasource. It includes panels for:
- RPC request rate and p95 latency
- Portal and upstream latency
- Batch size distribution
- NDJSON throughput
- Rate limits and timeouts
