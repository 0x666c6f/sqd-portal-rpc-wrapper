import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BenchResult = {
  target: string;
  method: string;
  kind: 'single' | 'batch';
  batchSize: number;
  requestBytes: number;
  batchChunks: number | null;
  params: unknown[];
  ok: number;
  errors: number;
  sampleError: string | null;
  minMs: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  maxMs: number;
};

const INPUT_PATH = resolve(process.env.BENCH_RESULTS_PATH || 'docs/benchmarks/bench-results.json');
const OUTPUT_PATHS = [
  resolve('docs/benchmarks/index.md'),
  resolve('docs/benchmarks/report.md')
];

const RAW = readFileSync(INPUT_PATH, 'utf8');
const JSON_START = RAW.indexOf('[');
const JSON_END = RAW.lastIndexOf(']');
if (JSON_START === -1 || JSON_END === -1) {
  throw new Error('bench results JSON not found');
}
const RESULTS = JSON.parse(RAW.slice(JSON_START, JSON_END + 1)) as BenchResult[];

const METHOD_ORDER = [
  'eth_blockNumber',
  'eth_getBlockByHash',
  'eth_getBlockByNumber(fullTx=false)',
  'eth_getBlockByNumber(fullTx=true)',
  'eth_getLogs',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'trace_block',
  'trace_transaction'
];

function formatLabel(result: BenchResult) {
  if (result.method === 'eth_getBlockByNumber' && Array.isArray(result.params)) {
    const fullTx = result.params[1];
    if (typeof fullTx === 'boolean') {
      return `eth_getBlockByNumber(fullTx=${fullTx})`;
    }
  }
  return result.method;
}

const singleResults = RESULTS.filter((entry) => entry.kind === 'single');
const singleByLabel = new Map<string, BenchResult[]>();
for (const entry of singleResults) {
  const label = formatLabel(entry);
  const list = singleByLabel.get(label) || [];
  list.push(entry);
  singleByLabel.set(label, list);
}

const labels = [
  ...METHOD_ORDER.filter((entry) => singleByLabel.has(entry)),
  ...Array.from(singleByLabel.keys()).filter((entry) => !METHOD_ORDER.includes(entry)).sort()
];

function pick(entries: BenchResult[], target: string) {
  return entries.find((entry) => entry.target === target);
}

const summaryRows = [];
for (const label of labels) {
  const entries = singleByLabel.get(label);
  if (!entries) continue;
  const wrapper = pick(entries, 'wrapper');
  const rpc = pick(entries, 'rpc');
  if (!wrapper || !rpc) continue;
  if (wrapper.errors > 0 || rpc.errors > 0) continue;
  const speedup = rpc.meanMs / wrapper.meanMs;
  summaryRows.push([label, round(wrapper.meanMs), round(rpc.meanMs), `${round(speedup)}x`]);
}

const batchResults = RESULTS.filter((entry) => entry.kind === 'batch');
const batchMethods = Array.from(new Set(batchResults.map((entry) => baseBatchMethod(entry.method)))).sort();
const batchSizesByMethod = new Map<string, number[]>();
for (const method of batchMethods) {
  const sizes = Array.from(
    new Set(batchResults.filter((entry) => baseBatchMethod(entry.method) === method).map((entry) => entry.batchSize))
  ).sort((a, b) => a - b);
  batchSizesByMethod.set(method, sizes);
}

const batchRowsByMethod = new Map<string, Array<Array<string | number>>>();
for (const method of batchMethods) {
  const sizes = batchSizesByMethod.get(method) || [];
  const rows: Array<Array<string | number>> = [];
  for (const size of sizes) {
    for (const target of ['wrapper', 'rpc']) {
      const entry = batchResults.find(
        (result) => result.target === target && result.batchSize === size && baseBatchMethod(result.method) === method
      );
      if (!entry) continue;
      rows.push([
        target,
        size,
        round(entry.meanMs),
        round(entry.meanMs / entry.batchSize),
        entry.requestBytes,
        entry.batchChunks || 1
      ]);
    }
  }
  batchRowsByMethod.set(method, rows);
}

const meanSeriesWrapper = labels.map((label) => round(pick(singleByLabel.get(label) || [], 'wrapper')?.meanMs || 0));
const meanSeriesRpc = labels.map((label) => round(pick(singleByLabel.get(label) || [], 'rpc')?.meanMs || 0));
const p95SeriesWrapper = labels.map((label) => round(pick(singleByLabel.get(label) || [], 'wrapper')?.p95Ms || 0));
const p95SeriesRpc = labels.map((label) => round(pick(singleByLabel.get(label) || [], 'rpc')?.p95Ms || 0));

const batchMeanByMethod = new Map<string, { sizes: number[]; wrapper: number[]; rpc: number[] }>();
for (const method of batchMethods) {
  const sizes = batchSizesByMethod.get(method) || [];
  const wrapper = sizes.map((size) => {
    const entry = batchResults.find(
      (result) => result.target === 'wrapper' && result.batchSize === size && baseBatchMethod(result.method) === method
    );
    return round(entry?.meanMs || 0);
  });
  const rpc = sizes.map((size) => {
    const entry = batchResults.find(
      (result) => result.target === 'rpc' && result.batchSize === size && baseBatchMethod(result.method) === method
    );
    return round(entry?.meanMs || 0);
  });
  batchMeanByMethod.set(method, { sizes, wrapper, rpc });
}

const singleRows = [];
for (const label of labels) {
  const entries = singleByLabel.get(label);
  if (!entries) continue;
  for (const target of ['wrapper', 'rpc']) {
    const entry = pick(entries, target);
    if (!entry) continue;
    singleRows.push([
      target,
      label,
      entry.ok,
      entry.errors,
      round(entry.meanMs),
      round(entry.p95Ms),
      entry.requestBytes
    ]);
  }
}

const batchDetailRows = [];
for (const method of batchMethods) {
  const sizes = batchSizesByMethod.get(method) || [];
  for (const size of sizes) {
    for (const target of ['wrapper', 'rpc']) {
      const entry = batchResults.find(
        (result) => result.target === target && result.batchSize === size && baseBatchMethod(result.method) === method
      );
      if (!entry) continue;
      batchDetailRows.push([
        target,
        `${method} (batch=${entry.batchSize})`,
        entry.batchSize,
        entry.ok,
        entry.errors,
        round(entry.meanMs),
        round(entry.p95Ms),
        round(entry.meanMs / entry.batchSize),
        entry.requestBytes,
        entry.batchChunks || 1
      ]);
    }
  }
}

const content = buildReport({
  generatedAt: formatUtc(new Date()),
  summaryRows,
  labels,
  meanSeriesWrapper,
  meanSeriesRpc,
  p95SeriesWrapper,
  p95SeriesRpc,
  batchMethods,
  batchRowsByMethod,
  batchMeanByMethod,
  singleRows,
  batchDetailRows
});

for (const output of OUTPUT_PATHS) {
  writeFileSync(output, content);
}

function formatUtc(date: Date) {
  const iso = date.toISOString().replace('T', ' ');
  return `${iso.slice(0, 19)} UTC`;
}

function round(value: number | undefined) {
  if (!value || Number.isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [headerLine, separator, body].join('\n');
}

function renderBars(label: string, pairs: Array<{ name: string; value: number }>, width = 32) {
  const max = Math.max(...pairs.map((pair) => pair.value), 0);
  const lines = [label];
  for (const pair of pairs) {
    const count = max > 0 ? Math.max(1, Math.round((pair.value / max) * width)) : 0;
    const bar = '#'.repeat(count).padEnd(width, ' ');
    lines.push(`  ${pair.name.padEnd(10)} ${pair.value.toFixed(2)} |${bar}|`);
  }
  return lines.join('\n');
}

function renderGraphs(
  title: string,
  labelsList: string[],
  wrapperValues: number[],
  rpcValues: number[]
) {
  const sections = [title];
  for (let i = 0; i < labelsList.length; i += 1) {
    sections.push(
      renderBars(labelsList[i], [
        { name: 'wrapper', value: wrapperValues[i] },
        { name: 'rpc', value: rpcValues[i] }
      ])
    );
  }
  return sections.join('\n');
}

function baseBatchMethod(method: string) {
  const idx = method.indexOf(' (batch=');
  return idx === -1 ? method : method.slice(0, idx);
}

function batchSizesFor(method: string, data: { batchMeanByMethod: Map<string, { sizes: number[] }> }) {
  const entry = data.batchMeanByMethod.get(method);
  return entry ? entry.sizes.join(',') : '';
}

function renderBatchTables(data: {
  batchMethods: string[];
  batchRowsByMethod: Map<string, Array<Array<string | number>>>;
}) {
  const sections: string[] = [];
  for (const method of data.batchMethods) {
    const rows = data.batchRowsByMethod.get(method);
    if (!rows || rows.length === 0) continue;
    sections.push(`### ${method}`);
    sections.push('');
    sections.push(table(['target', 'batch size', 'mean ms', 'mean ms / req', 'request bytes', 'chunks'], rows));
    sections.push('');
  }
  return sections;
}

function renderBatchCharts(data: {
  batchMethods: string[];
  batchMeanByMethod: Map<string, { sizes: number[]; wrapper: number[]; rpc: number[] }>;
}) {
  const sections: string[] = [];
  for (const method of data.batchMethods) {
    const series = data.batchMeanByMethod.get(method);
    if (!series || series.sizes.length === 0) continue;
    sections.push(`### Batch size vs mean latency (${method})`);
    sections.push('');
    sections.push('```mermaid');
    sections.push('xychart-beta');
    sections.push(`  title "Batch size vs mean latency (${method})"`);
    sections.push(`  x-axis [${series.sizes.join(', ')}]`);
    sections.push('  y-axis "ms"');
    sections.push(`  bar "wrapper" [${series.wrapper.join(', ')}]`);
    sections.push(`  bar "rpc" [${series.rpc.join(', ')}]`);
    sections.push('```');
    sections.push('');
  }
  return sections;
}

function renderBatchGraphs(data: {
  batchMethods: string[];
  batchMeanByMethod: Map<string, { sizes: number[]; wrapper: number[]; rpc: number[] }>;
}) {
  const sections: string[] = [];
  for (const method of data.batchMethods) {
    const series = data.batchMeanByMethod.get(method);
    if (!series || series.sizes.length === 0) continue;
    sections.push(`Batch: ${method}`);
    const graph = renderGraphs(
      '',
      series.sizes.map((size) => `size=${size}`),
      series.wrapper,
      series.rpc
    )
      .trim()
      .replace(/^/gm, '  ');
    sections.push(graph);
    sections.push('');
  }
  return sections;
}

function buildReport(data: {
  generatedAt: string;
  summaryRows: Array<Array<string | number>>;
  labels: string[];
  meanSeriesWrapper: number[];
  meanSeriesRpc: number[];
  p95SeriesWrapper: number[];
  p95SeriesRpc: number[];
  batchMethods: string[];
  batchRowsByMethod: Map<string, Array<Array<string | number>>>;
  batchMeanByMethod: Map<string, { sizes: number[]; wrapper: number[]; rpc: number[] }>;
  singleRows: Array<Array<string | number>>;
  batchDetailRows: Array<Array<string | number>>;
}) {
  const benchMethods =
    process.env.BENCH_METHODS ||
    data.labels
      .map((entry) => entry.replace('fullTx=false', '').replace('fullTx=true', '').replace('()', '').replace(/\s+/g, ''))
      .map((entry) => entry.replace('eth_getBlockByNumber', 'eth_getBlockByNumber'))
      .join(',');
  const batchSizes = process.env.BENCH_BATCH_SIZES || data.batchMethods.map((method) => batchSizesFor(method, data)).join(' | ');
  const batchMethods = process.env.BENCH_BATCH_METHODS || data.batchMethods.join(',');
  const batchSizesHeavy = process.env.BENCH_BATCH_SIZES_HEAVY;
  const lines = [
    '# Benchmarks',
    '',
    `Generated: ${data.generatedAt}`,
    '',
    '## Summary',
    '',
    'Methods with successful measurements on both wrapper and reference RPC:',
    '',
    table(['method', 'wrapper mean ms', 'rpc mean ms', 'speedup (rpc/wrapper)'], data.summaryRows),
    '',
    'Batch sizing impact:',
    '',
    ...renderBatchTables(data),
    '',
    'Note: some large batches were split into chunks due to upstream limits. The "chunks" column indicates how many requests were used.',
    '',
    '## Charts',
    '',
    '### Mean latency (ms)',
    '',
    '```mermaid',
    'xychart-beta',
    '  title "Mean latency by method"',
    `  x-axis ["${data.labels.join('", "')}"]`,
    '  y-axis "ms"',
    `  bar "wrapper" [${data.meanSeriesWrapper.join(', ')}]`,
    `  bar "rpc" [${data.meanSeriesRpc.join(', ')}]`,
    '```',
    '',
    '### P95 latency (ms)',
    '',
    '```mermaid',
    'xychart-beta',
    '  title "P95 latency by method"',
    `  x-axis ["${data.labels.join('", "')}"]`,
    '  y-axis "ms"',
    `  bar "wrapper" [${data.p95SeriesWrapper.join(', ')}]`,
    `  bar "rpc" [${data.p95SeriesRpc.join(', ')}]`,
    '```',
    '',
    ...renderBatchCharts(data),
    '',
    '## Run Parameters',
    '',
    `- rpc_url: \`${process.env.RPC_URL || 'unknown'}\``,
    `- wrapper_url: \`${process.env.WRAPPER_URL || 'unknown'}\``,
    `- chain_id: ${process.env.CHAIN_ID || 'unknown'}`,
    `- iterations: ${process.env.BENCH_ITERATIONS || 'unknown'}`,
    `- concurrency: ${process.env.BENCH_CONCURRENCY || 'unknown'}`,
    `- delay_ms: ${process.env.BENCH_DELAY_MS || 'unknown'}`,
    `- timeout_ms: ${process.env.BENCH_TIMEOUT_MS || 'unknown'}`,
    `- batch_sizes: ${batchSizes}`,
    ...(batchSizesHeavy ? [`- batch_sizes_heavy: ${batchSizesHeavy}`] : []),
    `- batch_methods: ${batchMethods}`,
    `- bench_methods: ${benchMethods}`,
    `- batch_chunk_size: ${process.env.BENCH_BATCH_CHUNK_SIZE || 'unknown'}`,
    `- retries: ${process.env.BENCH_RETRIES || 'unknown'}`,
    '',
    '## Single Request Results',
    '',
    table(['target', 'method', 'ok', 'errors', 'mean ms', 'p95 ms', 'request bytes'], data.singleRows),
    '',
    '## Batch Results',
    '',
    table(
      ['target', 'method', 'batch size', 'ok', 'errors', 'mean ms', 'p95 ms', 'mean ms / req', 'request bytes', 'chunks'],
      data.batchDetailRows
    ),
    '',
    '## Graphs (mean ms)',
    '',
    '```',
    renderGraphs('', data.labels, data.meanSeriesWrapper, data.meanSeriesRpc).trim(),
    '',
    ...renderBatchGraphs(data),
    '```',
    '',
    '## Graphs (p95 ms)',
    '',
    '```',
    renderGraphs('', data.labels, data.p95SeriesWrapper, data.p95SeriesRpc).trim(),
    '```'
  ];

  return lines.join('\n');
}
