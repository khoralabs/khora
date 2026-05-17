/**
 * Run multiple scenarios × concurrency levels and emit one JSON document (file or stdout).
 *
 * Usage:
 *   bun run bench:sweep-json -- --strategy sqlite --output bench-sqlite.json
 *   bun run bench:sweep-json -- --concurrency 1,8,16
 *
 * Default iterations/warmup/cells/fanout/payload/strategy match **`CANONICAL_BENCH_DEFAULTS`** (`bench-defaults.ts`).
 */

import { CANONICAL_BENCH_DEFAULTS } from "./bench-defaults.ts";
import type { BenchResult } from "./scenarios.ts";
import { BENCH_SCENARIO_IDS, benchCellIds, runScenario, type ScenarioId } from "./scenarios.ts";
import { getBenchmarkStrategies } from "./strategies.ts";

type SweepCliArgs = {
  strategy: string;
  outputPath: string | null;
  scenarios: readonly ScenarioId[];
  concurrencyLevels: number[];
  iterations: number;
  warmup: number;
  cells: number;
  fanout: number;
  payloadBytes: number;
  cellWorkers: boolean;
  help: boolean;
};

type SweepReport = {
  readonly generated_at_ms: number;
  readonly config: {
    readonly strategy: string;
    readonly iterations: number;
    readonly warmup: number;
    readonly cells: number;
    readonly fanout: number;
    readonly payload_bytes: number;
    readonly concurrency_levels: readonly number[];
    readonly scenarios: readonly ScenarioId[];
    readonly cell_workers: boolean;
  };
  readonly strategy: string;
  readonly iterations: number;
  readonly warmup: number;
  readonly cells: number;
  readonly fanout: number;
  readonly payload_bytes: number;
  readonly concurrency_levels: readonly number[];
  readonly scenarios: readonly ScenarioId[];
  readonly cell_workers: boolean;
  readonly runs: readonly BenchResult[];
};

function usage(): string {
  return `Usage: bun run bench:sweep-json -- [options]

Runs every scenario for each --concurrency value and prints/writes a single JSON object.

Options:
  --strategy <name>       persistence factory (default | sqlite), default ${CANONICAL_BENCH_DEFAULTS.strategy}
  --output, -o <path>     write JSON to file (omit for stdout)
  --scenarios <list>      comma-separated scenario ids (default: all)
  --concurrency <list>    comma-separated ints (default: 1,8,16)
  --iterations <n>        default ${CANONICAL_BENCH_DEFAULTS.iterations}
  --warmup <n>            default ${CANONICAL_BENCH_DEFAULTS.warmup}
  --cells <n>             default ${CANONICAL_BENCH_DEFAULTS.cells}
  --fanout <n>            default ${CANONICAL_BENCH_DEFAULTS.fanout}
  --payload-bytes <n>     default ${CANONICAL_BENCH_DEFAULTS.payloadBytes}
  --cell-workers          sqlite only: cell SQLite runs in Bun Workers (off main thread)
  --help, -h              this message

Known scenarios: ${BENCH_SCENARIO_IDS.join(", ")}
`;
}

function parseCommaInts(s: string, flag: string): number[] {
  const parts = s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  if (parts.length === 0) {
    throw new Error(`${flag} must list at least one integer`);
  }
  const out: number[] = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`${flag}: invalid integer ${p}`);
    }
    out.push(n);
  }
  return out;
}

function parseScenarios(s: string): ScenarioId[] {
  const parts = s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  const out: ScenarioId[] = [];
  for (const p of parts) {
    if (!BENCH_SCENARIO_IDS.includes(p as ScenarioId)) {
      throw new Error(`Unknown scenario ${p}; expected one of: ${BENCH_SCENARIO_IDS.join(", ")}`);
    }
    out.push(p as ScenarioId);
  }
  return out;
}

function parseArgs(argv: string[]): SweepCliArgs {
  const out: SweepCliArgs = {
    strategy: CANONICAL_BENCH_DEFAULTS.strategy,
    outputPath: null,
    scenarios: BENCH_SCENARIO_IDS,
    concurrencyLevels: [1, 8, 16],
    iterations: CANONICAL_BENCH_DEFAULTS.iterations,
    warmup: CANONICAL_BENCH_DEFAULTS.warmup,
    cells: CANONICAL_BENCH_DEFAULTS.cells,
    fanout: CANONICAL_BENCH_DEFAULTS.fanout,
    payloadBytes: CANONICAL_BENCH_DEFAULTS.payloadBytes,
    cellWorkers: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`Missing value after ${a}`);
      }
      return v;
    };
    if (a === "--strategy") {
      out.strategy = next();
      continue;
    }
    if (a === "--output" || a === "-o") {
      out.outputPath = next();
      continue;
    }
    if (a === "--scenarios") {
      out.scenarios = parseScenarios(next());
      continue;
    }
    if (a === "--concurrency") {
      out.concurrencyLevels = parseCommaInts(next(), "--concurrency");
      continue;
    }
    if (a === "--iterations") {
      out.iterations = Number.parseInt(next(), 10);
      continue;
    }
    if (a === "--warmup") {
      out.warmup = Number.parseInt(next(), 10);
      continue;
    }
    if (a === "--cells") {
      out.cells = Number.parseInt(next(), 10);
      continue;
    }
    if (a === "--fanout") {
      out.fanout = Number.parseInt(next(), 10);
      continue;
    }
    if (a === "--payload-bytes") {
      out.payloadBytes = Number.parseInt(next(), 10);
      continue;
    }
    if (a === "--cell-workers") {
      out.cellWorkers = true;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function validateArgs(args: SweepCliArgs): void {
  if (args.iterations < 1) throw new Error("--iterations must be >= 1");
  if (args.warmup < 0) throw new Error("--warmup must be >= 0");
  if (args.cells < 1) throw new Error("--cells must be >= 1");
  if (args.fanout < 1) throw new Error("--fanout must be >= 1");
  if (args.payloadBytes < 1) throw new Error("--payload-bytes must be >= 1");
  if (args.cellWorkers && args.strategy !== "sqlite") {
    throw new Error("--cell-workers requires --strategy sqlite");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: SweepCliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  try {
    validateArgs(args);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  const cellIds = benchCellIds(args.cells);
  const runs: BenchResult[] = [];

  for (const scenario of args.scenarios) {
    for (const concurrency of args.concurrencyLevels) {
      console.error(`bench sweep: ${scenario} concurrency=${concurrency}`);
      const strategies = getBenchmarkStrategies(args.strategy, {
        sqlite: args.strategy === "sqlite" ? { useCellWorkers: args.cellWorkers } : undefined,
      });
      try {
        const r = await runScenario(scenario, {
          strategies,
          strategyName: args.strategy,
          cellIds,
          fanout: args.fanout,
          payloadBytes: args.payloadBytes,
          iterations: args.iterations,
          warmup: args.warmup,
          concurrency,
        });
        runs.push(r);
      } finally {
        strategies.teardown?.();
      }
    }
  }

  const sweepConfig = {
    strategy: args.strategy,
    iterations: args.iterations,
    warmup: args.warmup,
    cells: args.cells,
    fanout: args.fanout,
    payload_bytes: args.payloadBytes,
    concurrency_levels: args.concurrencyLevels,
    scenarios: args.scenarios,
    cell_workers: args.cellWorkers,
  } as const;

  const report: SweepReport = {
    generated_at_ms: Date.now(),
    config: sweepConfig,
    ...sweepConfig,
    runs,
  };

  const text = `${JSON.stringify(report, null, 2)}\n`;

  if (args.outputPath !== null) {
    await Bun.write(args.outputPath, text);
    console.error(`Wrote ${runs.length} bench runs to ${args.outputPath}`);
  } else {
    process.stdout.write(text);
  }
}

await main();
