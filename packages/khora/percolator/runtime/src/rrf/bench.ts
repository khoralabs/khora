import { fuseRrf, nowMs, type RrfArm } from "./index.js";

type Suite = "small" | "medium" | "large";

type BenchRecord = {
  ts: string;
  pkg: "@very-coffee/reciprocal-rank-fusion";
  suite: Suite;
  run: number;
  arms: number;
  itemsPerArm: number;
  uniqueIds: number;
  results: number;
  ms: number;
};

type BenchSummary = {
  ts: string;
  pkg: "@very-coffee/reciprocal-rank-fusion";
  type: "summary";
  suite: Suite;
  runs: number;
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function summarize(suite: Suite, times: number[]): BenchSummary {
  const sum = times.reduce((acc, value) => acc + value, 0);
  return {
    ts: new Date().toISOString(),
    pkg: "@very-coffee/reciprocal-rank-fusion",
    type: "summary",
    suite,
    runs: times.length,
    p50: percentile(times, 50),
    p90: percentile(times, 90),
    p99: percentile(times, 99),
    min: Math.min(...times),
    max: Math.max(...times),
    avg: sum / Math.max(1, times.length),
  };
}

function makeArms(
  arms: number,
  itemsPerArm: number,
  overlapFactor: number,
): { armsOut: RrfArm[]; uniqueIds: number } {
  const uniqueIds = Math.max(1, Math.floor(itemsPerArm * overlapFactor));
  const ids = Array.from({ length: uniqueIds }, (_, i) => `doc-${i}`);
  const armsOut: RrfArm[] = [];

  for (let arm = 0; arm < arms; arm++) {
    const ranked = Array.from({ length: itemsPerArm }, (_, i) => {
      const idx = (i + arm * 17) % ids.length;
      const id = ids[idx] ?? ids[0] ?? "doc-0";
      return {
        id,
        boost: 1 + ((arm + i) % 5) * 0.05,
      };
    });
    armsOut.push({
      armId: `arm-${arm}`,
      weight: 1 + (arm % 3) * 0.25,
      ranked,
    });
  }

  return { armsOut, uniqueIds };
}

async function runSuite(
  suite: Suite,
  runs: number,
  arms: number,
  itemsPerArm: number,
  overlapFactor: number,
): Promise<{ records: BenchRecord[]; summary: BenchSummary }> {
  const records: BenchRecord[] = [];
  const times: number[] = [];

  for (let run = 1; run <= runs; run++) {
    const { armsOut, uniqueIds } = makeArms(arms, itemsPerArm, overlapFactor);
    const start = nowMs();
    const out = fuseRrf(armsOut, { k: 60 });
    const ms = nowMs() - start;

    records.push({
      ts: new Date().toISOString(),
      pkg: "@very-coffee/reciprocal-rank-fusion",
      suite,
      run,
      arms,
      itemsPerArm,
      uniqueIds,
      results: out.length,
      ms,
    });
    times.push(ms);
  }

  return { records, summary: summarize(suite, times) };
}

const suites = await Promise.all([
  runSuite("small", 20, 5, 100, 1.2),
  runSuite("medium", 20, 10, 1000, 1.5),
  runSuite("large", 10, 20, 10000, 2.0),
]);

const timestamp = new Date().toISOString().replaceAll(":", "-");
const outPath = `.bench/rrf-${timestamp}.jsonl`;
await Bun.$`mkdir -p .bench`;

const lines = [
  ...suites.flatMap((suite) => suite.records.map((r) => JSON.stringify(r))),
  ...suites.map((suite) => JSON.stringify(suite.summary)),
].join("\n");
await Bun.write(outPath, `${lines}\n`);

for (const suite of suites) {
  console.log(
    `[rrf bench] ${suite.summary.suite} p90=${suite.summary.p90.toFixed(2)} p99=${suite.summary.p99.toFixed(2)} ms`,
  );
}
console.log(`[rrf bench] wrote ${outPath}`);
