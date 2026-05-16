import type { ScenarioId } from "./scenarios.ts";

/**
 * Defaults when `bun run bench` is invoked with no workload flags — SQLite,
 * **`post_catalog_fanout`**, 3000 timed / 200 warmup (matches common comparison runs).
 */
export const CANONICAL_BENCH_DEFAULTS = {
  scenario: "post_catalog_fanout" satisfies ScenarioId,
  strategy: "sqlite",
  iterations: 3000,
  warmup: 200,
  cells: 8,
  fanout: 4,
  payloadBytes: 4096,
  concurrency: 1,
} as const;
