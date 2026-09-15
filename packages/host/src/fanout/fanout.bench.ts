import { type CellNodeClient, type CellRoute, RoutedInboxDelivery } from "@khoralabs/colonnade";
import type { Percolator } from "@khoralabs/percolator";
import { createInMemoryFanOutQueue } from "../persistence/core/in-memory-fan-out-queue";
import type { FanOutPlanningJobInput, PrincipalOrdinalPort } from "../persistence/core/port";
import {
  type FanOutWorkerEvent,
  runNextFanOutDeliveryChunk,
  runNextFanOutPlanningJob,
} from "./workers";

const targets = positiveArg("targets", 20_000);
const pageSize = positiveArg("page-size", 512);
const chunkSize = positiveArg("chunk-size", 1_000);
const batchSize = positiveArg("batch-size", 128);
const concurrency = positiveArg("concurrency", 8);
const pages: number[] = [];
const batches: number[] = [];
let maxActiveBatches = 0;
const events: FanOutWorkerEvent[] = [];
const queue = createInMemoryFanOutQueue();
const input: FanOutPlanningJobInput = {
  tenantKey: "benchmark",
  postId: "fanout-benchmark",
  sourceCellId: "source",
  sourceRecordKey: "record",
  sourceContentHash: "a".repeat(64),
  cellPoolCount: 4,
  authorPrincipalId: "did:author",
  postKind: "post",
  postMetadata: {},
  visibility: "public",
  fanOutPolicy: { mode: "push" },
};
const jobId = queue.enqueuePlanning(input, 0);
const percolator = {
  async *evaluateCandidateStream() {
    for (let offset = 0; offset < targets; offset += pageSize) {
      const length = Math.min(pageSize, targets - offset);
      pages.push(length);
      for (let index = offset; index < offset + length; index++) {
        yield { ownerId: `did:${index}`, ownerOrdinal: index, matches: [{ queryId: "q" }] };
      }
    }
  },
} as unknown as Percolator;

const planningStarted = performance.now();
await runNextFanOutPlanningJob({
  queue,
  percolator,
  candidateForJob: () => ({
    candidateId: input.postId,
    authorId: input.authorPrincipalId,
    namespace: "global/posts",
    labelKinds: ["post"],
    content: {},
    createdAtMs: 0,
  }),
  pageSize,
  chunkSize,
  now: () => 0,
  observe: (event) => events.push(event),
});
const planningMs = performance.now() - planningStarted;

const route: CellRoute = {
  nodeId: "node",
  endpoint: "benchmark",
  partitionId: "partition",
  backendKind: "sqlite",
  epoch: 1,
};
const client: CellNodeClient = {
  async enqueueMany(_route, batch) {
    return {
      delivered_count: batch.deliveries.length,
      success_bitmap: new Uint8Array(Math.ceil(batch.deliveries.length / 8)).fill(0xff),
    };
  },
};
const routed = new RoutedInboxDelivery({
  placement: {
    async resolveMany(cellIds) {
      return new Map(
        cellIds.map((cellId, index) => [cellId, { ...route, partitionId: `p${index % 7}` }]),
      );
    },
  },
  client,
  maxBatchSize: batchSize,
  concurrency,
  maxTargets: chunkSize,
  observeBatch(event) {
    batches.push(event.targets);
    maxActiveBatches = Math.max(maxActiveBatches, event.active);
  },
});
const ordinals: PrincipalOrdinalPort = {
  getOrCreate: () => 0,
  getByDid: () => undefined,
  getManyByDid: () => new Map(),
  resolveMany: (values) => new Map(values.map((ordinal) => [ordinal, `did:${ordinal}`])),
};
const deliveryStarted = performance.now();
while (
  await runNextFanOutDeliveryChunk({
    queue,
    principalOrdinals: ordinals,
    inboxDelivery: routed,
    cellIdForPrincipal: (did) => `cell:${Number(did.slice(4)) % 113}`,
    now: () => 0,
    observe: (event) => events.push(event),
  })
) {}
const deliveryMs = performance.now() - deliveryStarted;
const chunks = queue.listWorkloadChunks(jobId);

assertBound("page", pages, pageSize);
assertBound(
  "chunk",
  chunks.map(({ records }) => records.length),
  chunkSize,
);
assertBound("batch", batches, batchSize);
if (maxActiveBatches > concurrency) throw new Error("route concurrency bound exceeded");
if (queue.getJob(jobId)?.status !== "completed") throw new Error("benchmark job did not complete");

console.log(
  JSON.stringify({
    targets,
    planning: {
      ms: planningMs,
      targetsPerSecond: rate(targets, planningMs),
      pages: pages.length,
      maxPage: Math.max(...pages),
      chunks: chunks.length,
      maxChunk: Math.max(...chunks.map(({ records }) => records.length)),
    },
    delivery: {
      ms: deliveryMs,
      targetsPerSecond: rate(targets, deliveryMs),
      batches: batches.length,
      maxBatch: Math.max(...batches),
      maxActiveBatches,
    },
    observations: events.length,
  }),
);

function positiveArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const value = Number(
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback,
  );
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be positive`);
  return value;
}

function assertBound(name: string, values: readonly number[], limit: number): void {
  if (values.length === 0 || Math.max(...values) > limit) throw new Error(`${name} bound exceeded`);
}

function rate(count: number, ms: number): number {
  return Math.round((count * 1_000) / ms);
}
