import { ColonnadePublicationClient } from "../colonnade-publication-client.ts";
import { ColonnadeRouter } from "../colonnade-router.ts";
import type { RoutedWrite, WriteOp } from "../colonnade-types.ts";
import { sha256HexLower } from "../hash.ts";
import type { SampleSummary } from "./stats.ts";
import { summarizeMs } from "./stats.ts";
import type { BenchmarkStrategies } from "./strategies.ts";

const TENANT = "bench-tenant";
/** Stable empty metadata for benches (minimal JSON in SQLite). */
const BENCH_PAYLOAD_META = {};

function fillBenchPayload(scratch: Uint8Array, seed: number): void {
  for (let i = 0; i < scratch.byteLength; i++) {
    scratch[i] = (seed + i) % 251;
  }
}

export type BenchRunParams = {
  readonly strategies: BenchmarkStrategies;
  readonly strategyName: string;
  readonly cellIds: readonly string[];
  readonly fanout: number;
  readonly payloadBytes: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly concurrency: number;
};

export type BenchResult = {
  readonly scenario: string;
  readonly strategy: string;
  readonly iterations: number;
  readonly warmup: number;
  readonly concurrency: number;
  readonly cells: number;
  readonly fanout: number;
  readonly payload_bytes: number;
  readonly wall_ms: number;
  readonly summary: SampleSummary;
  readonly ops_per_sec_wall: number;
};

export function benchCellIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `bench-cell-${i}`);
}

async function runTimedIterations(
  iterations: number,
  warmup: number,
  concurrency: number,
  payloadSize: number,
  runOne: (seed: number, scratch: Uint8Array) => Promise<void>,
): Promise<{ samples_ms: number[]; wall_ms: number }> {
  const scratches = Array.from({ length: concurrency }, () => new Uint8Array(payloadSize));

  let w = 0;
  while (w < warmup) {
    const scratch = scratches[w % concurrency];
    if (scratch === undefined) {
      throw new Error("bench: missing payload scratch buffer");
    }
    fillBenchPayload(scratch, -1000000 - w);
    await runOne(-1000000 - w, scratch);
    w += 1;
  }

  const samples: number[] = [];
  const wall0 = performance.now();
  let idx = 0;
  while (idx < iterations) {
    const waveSize = Math.min(concurrency, iterations - idx);
    const wave: Promise<void>[] = [];
    for (let k = 0; k < waveSize; k++) {
      const seed = idx;
      idx += 1;
      const scratch = scratches[k];
      if (scratch === undefined) {
        throw new Error("bench: missing payload scratch buffer");
      }
      fillBenchPayload(scratch, seed);
      wave.push(
        (async () => {
          const t0 = performance.now();
          await runOne(seed, scratch);
          samples.push(performance.now() - t0);
        })(),
      );
    }
    await Promise.all(wave);
  }
  const wall_ms = performance.now() - wall0;
  return { samples_ms: samples, wall_ms };
}

function finishResult(
  scenario: string,
  params: BenchRunParams,
  samples_ms: number[],
  wall_ms: number,
): BenchResult {
  const summary = summarizeMs(samples_ms);
  const ops_per_sec_wall =
    wall_ms > 0 ? params.iterations / (wall_ms / 1000) : Number.POSITIVE_INFINITY;
  return {
    scenario,
    strategy: params.strategyName,
    iterations: params.iterations,
    warmup: params.warmup,
    concurrency: params.concurrency,
    cells: params.cellIds.length,
    fanout: params.fanout,
    payload_bytes: params.payloadBytes,
    wall_ms,
    summary,
    ops_per_sec_wall,
  };
}

export async function benchPostOutboxOnly(params: BenchRunParams): Promise<BenchResult> {
  const author = params.cellIds[0];
  if (author === undefined) {
    throw new Error("post_outbox_only requires at least one cell (--cells >= 1)");
  }

  const catalog = params.strategies.createCatalog();
  const resolve = params.strategies.createResolveCell(params.cellIds);
  const pub = new ColonnadePublicationClient(catalog, resolve);

  const { samples_ms, wall_ms } = await runTimedIterations(
    params.iterations,
    params.warmup,
    params.concurrency,
    params.payloadBytes,
    async (seed, bytes) => {
      await pub.postOperation({
        author_principal_id: `bench-author-${seed}`,
        author_cell_id: author,
        tenant_key: TENANT,
        payload_bytes: bytes,
        payload_metadata: BENCH_PAYLOAD_META,
        routing: {
          replicate_to_catalog: false,
          catalog_envelope: {},
          fan_out_targets: [],
        },
      });
    },
  );

  return finishResult("post_outbox_only", params, samples_ms, wall_ms);
}

export async function benchPostCatalogFanout(params: BenchRunParams): Promise<BenchResult> {
  const author = params.cellIds[0];
  if (author === undefined) {
    throw new Error("post_catalog_fanout requires at least one author cell");
  }
  if (params.cellIds.length < 1 + params.fanout) {
    throw new Error(
      `post_catalog_fanout needs cells >= fanout + 1 (${params.cellIds.length} cells, fanout ${params.fanout})`,
    );
  }

  const recipients = params.cellIds.slice(1, 1 + params.fanout);

  const catalog = params.strategies.createCatalog();
  const resolve = params.strategies.createResolveCell(params.cellIds);
  const pub = new ColonnadePublicationClient(catalog, resolve);

  const { samples_ms, wall_ms } = await runTimedIterations(
    params.iterations,
    params.warmup,
    params.concurrency,
    params.payloadBytes,
    async (seed, bytes) => {
      await pub.postOperation({
        author_principal_id: `bench-author-${seed}`,
        author_cell_id: author,
        tenant_key: TENANT,
        payload_bytes: bytes,
        payload_metadata: BENCH_PAYLOAD_META,
        routing: {
          replicate_to_catalog: true,
          catalog_envelope: { b: seed },
          fan_out_targets: recipients.map((recipient_cell_id, i) => ({
            recipient_cell_id,
            recipient_principal_id: `bench-sub-${i}-${seed}`,
          })),
        },
      });
    },
  );

  return finishResult("post_catalog_fanout", params, samples_ms, wall_ms);
}

export async function benchRouterFanOutWrites(params: BenchRunParams): Promise<BenchResult> {
  if (params.fanout < 1) {
    throw new Error("router_fan_out_writes requires --fanout >= 1");
  }
  if (params.cellIds.length < params.fanout) {
    throw new Error(
      `router_fan_out_writes needs cells >= fanout (${params.cellIds.length} cells, fanout ${params.fanout})`,
    );
  }

  const targets = params.cellIds.slice(0, params.fanout);
  const inlineByte = new Uint8Array([42]);
  const inlineHash = sha256HexLower(inlineByte);

  const resolve = params.strategies.createResolveCell(params.cellIds);
  const router = new ColonnadeRouter(resolve);

  const { samples_ms, wall_ms } = await runTimedIterations(
    params.iterations,
    params.warmup,
    params.concurrency,
    params.payloadBytes,
    async (seed, _scratch) => {
      const writes: RoutedWrite[] = targets.map((target_cell_id, i) => {
        const op: WriteOp = {
          kind: "enqueue_inbox",
          enqueue_inbox: {
            target_cell_id,
            recipient_principal_id: `bench-sub-${i}`,
            staging: {
              kind: "inline",
              inline: { bytes: inlineByte, content_hash: inlineHash },
            },
            correlation_id: `inner-${seed}-${i}`,
          },
        };
        return {
          target_cell_id,
          correlation_id: `rt-${seed}-${i}`,
          op,
        };
      });
      await router.submitRoutedWrites({ writes });
    },
  );

  return finishResult("router_fan_out_writes", params, samples_ms, wall_ms);
}

export async function benchDrainCycle(params: BenchRunParams): Promise<BenchResult> {
  if (params.cellIds.length < 2) {
    throw new Error("drain_cycle requires at least two cells (--cells >= 2)");
  }

  const src = params.cellIds[0];
  const dst = params.cellIds[1];
  if (src === undefined || dst === undefined) {
    throw new Error("drain_cycle: missing source or destination cell");
  }

  const resolve = params.strategies.createResolveCell(params.cellIds);

  const { samples_ms, wall_ms } = await runTimedIterations(
    params.iterations,
    params.warmup,
    params.concurrency,
    params.payloadBytes,
    async (seed, bytes) => {
      const authorCell = resolve(src);
      const out = await authorCell.appendOutboxRecord({
        cell_id: src,
        tenant_key: TENANT,
        principal_id: `bench-author-${seed}`,
        record_key: "",
        payload_bytes: bytes,
        metadata: BENCH_PAYLOAD_META,
      });

      const ptr = {
        source_cell_id: src,
        source_record_key: out.record_key,
        content_hash: out.content_hash,
      };

      const recipientCell = resolve(dst);
      const { inbox_entry_id } = await recipientCell.enqueueInboxDelivery({
        cell_id: dst,
        tenant_key: TENANT,
        recipient_principal_id: "bench-recipient",
        staging: { kind: "pointer", pointer: { pointer: ptr } },
        correlation_id: `dr-${seed}`,
      });

      const fetched = await authorCell.fetchOutboxPayload({
        cell_id: src,
        locator: { cell_id: src, record_key: out.record_key },
      });

      await recipientCell.verifyAndDrainInboxBatch({
        cell_id: dst,
        tenant_key: TENANT,
        principal_id: "bench-recipient",
        inbox_entry_ids: [inbox_entry_id],
        resolved_payloads: [
          {
            inbox_entry_id,
            pointer: ptr,
            verified_bytes: fetched.payload_bytes,
          },
        ],
      });
    },
  );

  return finishResult("drain_cycle", params, samples_ms, wall_ms);
}

export type ScenarioId =
  | "post_outbox_only"
  | "post_catalog_fanout"
  | "router_fan_out_writes"
  | "drain_cycle";

/** Default scenarios for **`run.ts`** and **`sweep-json.ts`**. */
export const BENCH_SCENARIO_IDS: readonly ScenarioId[] = [
  "post_outbox_only",
  "post_catalog_fanout",
  "router_fan_out_writes",
  "drain_cycle",
];

export async function runScenario(id: ScenarioId, params: BenchRunParams): Promise<BenchResult> {
  switch (id) {
    case "post_outbox_only":
      return benchPostOutboxOnly(params);
    case "post_catalog_fanout":
      return benchPostCatalogFanout(params);
    case "router_fan_out_writes":
      return benchRouterFanOutWrites(params);
    case "drain_cycle":
      return benchDrainCycle(params);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown scenario: ${_exhaustive}`);
    }
  }
}
