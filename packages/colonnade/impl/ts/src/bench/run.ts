/**
 * Colonnade persistence benchmarks (Bun).
 *
 * Methodology:
 * - Warm-up iterations run first (discarded) so JIT/allocation stabilizes.
 * - Measured loop records per-operation wall time (performance.now) and total wall time for throughput.
 * - Cell ids are deterministic (`bench-cell-0`, …) so runs are comparable.
 * - `--concurrency` controls parallel in-flight operations per wave; samples remain per-operation latency.
 * - **`--strategy sqlite`** uses a temp catalog plus one SQLite file per bench cell; temp data is deleted after the run.
 * - In-memory (`default`) mostly reflects JS overhead; compare with **`sqlite`** for adapter + fs cost.
 *
 * Usage:
 *   bun run bench                              # canonical defaults (see **`CANONICAL_BENCH_DEFAULTS`**)
 *   bun run bench -- --scenario post_outbox_only --json
 *
 * With **`--json`**, stdout is an object with **`config`** (CLI-equivalent args) plus result fields.
 */

import { CANONICAL_BENCH_DEFAULTS } from "./bench-defaults";
import {
  BENCH_SCENARIO_IDS,
  type BenchResult,
  benchCellIds,
  runScenario,
  type ScenarioId,
} from "./scenarios";
import { getBenchmarkStrategies } from "./strategies";

export { CANONICAL_BENCH_DEFAULTS } from "./bench-defaults";

type CliArgs = {
  scenario: ScenarioId;
  strategy: string;
  iterations: number;
  warmup: number;
  cells: number;
  fanout: number;
  payloadBytes: number;
  concurrency: number;
  json: boolean;
  help: boolean;
};

function usage(): string {
  return `Usage: bun run bench -- [options]

Options:
  --scenario <id>     ${BENCH_SCENARIO_IDS.join(" | ")} (default: ${CANONICAL_BENCH_DEFAULTS.scenario})
  --strategy <name>   persistence factory (default | sqlite) (default: ${CANONICAL_BENCH_DEFAULTS.strategy})
  --iterations <n>    timed iterations (default: ${CANONICAL_BENCH_DEFAULTS.iterations})
  --warmup <n>        warmup iterations (default: ${CANONICAL_BENCH_DEFAULTS.warmup})
  --cells <n>         number of logical cells bench-cell-0.. (default: ${CANONICAL_BENCH_DEFAULTS.cells})
  --fanout <n>        recipients / router targets where applicable (default: ${CANONICAL_BENCH_DEFAULTS.fanout})
  --payload-bytes <n> publication/drain payload size (default: ${CANONICAL_BENCH_DEFAULTS.payloadBytes})
  --concurrency <n>   max parallel ops per wave (default: ${CANONICAL_BENCH_DEFAULTS.concurrency})
  --json              print one JSON object on stdout
  --help              this message
`;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    scenario: CANONICAL_BENCH_DEFAULTS.scenario,
    strategy: CANONICAL_BENCH_DEFAULTS.strategy,
    iterations: CANONICAL_BENCH_DEFAULTS.iterations,
    warmup: CANONICAL_BENCH_DEFAULTS.warmup,
    cells: CANONICAL_BENCH_DEFAULTS.cells,
    fanout: CANONICAL_BENCH_DEFAULTS.fanout,
    payloadBytes: CANONICAL_BENCH_DEFAULTS.payloadBytes,
    concurrency: CANONICAL_BENCH_DEFAULTS.concurrency,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--json") {
      out.json = true;
      continue;
    }
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`Missing value after ${a}`);
      }
      return v;
    };
    if (a === "--scenario") {
      const id = next();
      if (!BENCH_SCENARIO_IDS.includes(id as ScenarioId)) {
        throw new Error(
          `Unknown scenario ${id}; expected one of: ${BENCH_SCENARIO_IDS.join(", ")}`,
        );
      }
      out.scenario = id as ScenarioId;
      continue;
    }
    if (a === "--strategy") {
      out.strategy = next();
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
    if (a === "--concurrency") {
      out.concurrency = Number.parseInt(next(), 10);
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function validateArgs(args: CliArgs): void {
  if (args.iterations < 1) throw new Error("--iterations must be >= 1");
  if (args.warmup < 0) throw new Error("--warmup must be >= 0");
  if (args.cells < 1) throw new Error("--cells must be >= 1");
  if (args.fanout < 1) throw new Error("--fanout must be >= 1");
  if (args.payloadBytes < 1) throw new Error("--payload-bytes must be >= 1");
  if (args.concurrency < 1) throw new Error("--concurrency must be >= 1");
}

function printTable(r: BenchResult): void {
  const { summary } = r;
  console.log(`scenario           ${r.scenario}`);
  console.log(`strategy           ${r.strategy}`);
  console.log(`iterations         ${r.iterations}`);
  console.log(`warmup             ${r.warmup}`);
  console.log(`concurrency        ${r.concurrency}`);
  console.log(`cells              ${r.cells}`);
  console.log(`fanout             ${r.fanout}`);
  console.log(`payload_bytes      ${r.payload_bytes}`);
  console.log(`wall_ms            ${r.wall_ms.toFixed(3)}`);
  console.log(`ops/sec (wall)     ${r.ops_per_sec_wall.toFixed(1)}`);
  console.log(`mean_ms/op         ${summary.mean_ms.toFixed(4)}`);
  console.log(`p50_ms             ${summary.p50_ms.toFixed(4)}`);
  console.log(`p95_ms             ${summary.p95_ms.toFixed(4)}`);
  console.log(`p99_ms             ${summary.p99_ms.toFixed(4)}`);
  console.log(`min_ms             ${summary.min_ms.toFixed(4)}`);
  console.log(`max_ms             ${summary.max_ms.toFixed(4)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: CliArgs;
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

  const strategies = getBenchmarkStrategies(args.strategy);
  const cellIds = benchCellIds(args.cells);

  let result: BenchResult;
  try {
    result = await runScenario(args.scenario, {
      strategies,
      strategyName: args.strategy,
      cellIds,
      fanout: args.fanout,
      payloadBytes: args.payloadBytes,
      iterations: args.iterations,
      warmup: args.warmup,
      concurrency: args.concurrency,
    });
  } finally {
    strategies.teardown?.();
  }

  if (args.json) {
    const doc = {
      config: {
        scenario: args.scenario,
        strategy: args.strategy,
        iterations: args.iterations,
        warmup: args.warmup,
        cells: args.cells,
        fanout: args.fanout,
        payload_bytes: args.payloadBytes,
        concurrency: args.concurrency,
      },
      ...result,
    };
    console.log(JSON.stringify(doc));
  } else {
    printTable(result);
  }
}

await main();
