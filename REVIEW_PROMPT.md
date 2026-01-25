# Review Prompt

Role: senior engineer, adversarial reviewer. Goal: catch defects, regressions, spec drift, and risk in SQD Portal RPC Wrapper.

## Project context
- TypeScript Node.js (>=20), Fastify HTTP server.
- JSON-RPC 2.0 wrapper translating EVM RPC → SQD Portal NDJSON streams.
- Optional upstream JSON-RPC fallback for hash lookups; gated by config.
- Primary specs: `2026-01-23-portal-wrapper-external-service-spec.md`,
  `codex-portal-realtime-spec.md`, `README.md`.

## Review checklist (apply relevant items only)
1) JSON-RPC correctness
   - Batch behavior, id echo, error codes/messages, HTTP status mapping.
   - Method allowlist; upstream-only methods gated by `UPSTREAM_METHODS_ENABLED`.
   - Hex quantity formatting, safe integer / BigInt handling, latest/finalized semantics.
2) Portal integration & dataset routing
   - ChainId→dataset mapping, single vs multi mode, header/path selection.
   - Portal endpoint selection (`/head`, `/finalized-head`, `/stream`, `/finalized-stream`).
   - URL normalization and unknown chainId errors.
3) Validation & limits
   - Block range, addresses/topics limits, request size, NDJSON line/byte caps.
   - Concurrency limit, circuit breaker, handler timeouts.
4) Streaming & performance
   - NDJSON parsing, backpressure, cancellation/abort, memory growth.
   - Correct partial responses, retries, and timeouts.
5) Observability & security
   - Metrics/logging coverage for new paths; labels are stable.
   - Secret redaction and request-body avoidance.
   - Timing-safe API key compare.
6) Tests
   - New behavior has tests (unit/integration).
   - Identify missing regression tests.

## Files to pay attention to
- `src/jsonrpc.ts`, `src/rpc/**`, `src/portal/**`, `src/server.ts`
- `src/config.ts`, `src/errors.ts`, `src/metrics.ts`, `src/util/**`

## Output format
1) Findings (severity-ordered): file path + line + issue + impact + fix.
2) Open questions / assumptions.
3) Test gaps / recommended tests + tests run.
4) Tiny summary (optional).

## Rules
- Be concrete; no fluff.
- Cite exact code locations.
- Quote exact error strings or keywords when they change.
- Prefer root-cause fixes.
- If no issues, say "No findings" and list residual risks.
