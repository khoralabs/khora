/** Sort ascending in-place copy and read percentile (nearest-rank, p in [0, 100]). */
export function percentile(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * n) - 1;
  const idx = Math.min(n - 1, Math.max(0, rank));
  if (!sortedAsc[idx]) throw new Error("Index out of bounds");
  return sortedAsc[idx];
}

export type SampleSummary = {
  readonly count: number;
  readonly mean_ms: number;
  readonly min_ms: number;
  readonly max_ms: number;
  readonly p50_ms: number;
  readonly p95_ms: number;
  readonly p99_ms: number;
};

export function summarizeMs(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) {
    return {
      count: 0,
      mean_ms: Number.NaN,
      min_ms: Number.NaN,
      max_ms: Number.NaN,
      p50_ms: Number.NaN,
      p95_ms: Number.NaN,
      p99_ms: Number.NaN,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  if (!minMs) throw new Error("Min ms is undefined");
  if (!maxMs) throw new Error("Max ms is undefined");
  return {
    count: samples.length,
    mean_ms: sum / samples.length,
    min_ms: sorted[0] ?? Number.NaN,
    max_ms: sorted[sorted.length - 1] ?? Number.NaN,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    p99_ms: percentile(sorted, 99),
  };
}
