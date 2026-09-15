import { type CellNodeClient, type CellRoute, RoutedInboxDelivery } from "@khoralabs/colonnade";
import type { Percolator } from "@khoralabs/percolator";
import { createInMemoryFanOutQueue } from "../persistence/core/in-memory-fan-out-queue";
import type { FanOutPlanningJobInput, PrincipalOrdinalPort } from "../persistence/core/port";
import type { ObjectStorePort } from "../receipts/object-store";
import { createDeliveryReceiptStore } from "../receipts/receipt-store";
import {
  createMemoryFanOutMetrics,
  recordFanOutRouteBatch,
  recordFanOutWorkerEvent,
} from "./metrics";
import {
  type FanOutWorkerEvent,
  runNextFanOutDeliveryChunk,
  runNextFanOutPlanningJob,
} from "./workers";

const profiles = {
  ci: { targets: 20_000 },
  stress: { targets: 100_000 },
  million: { targets: 1_000_000 },
} as const;

const profileName = profileArg();
const targets = positiveArg("targets", profiles[profileName].targets);
const pageSize = positiveArg("page-size", 512);
const chunkSize = positiveArg("chunk-size", 1_000);
const batchSize = positiveArg("batch-size", 128);
const concurrency = positiveArg("concurrency", 8);
const pages: number[] = [];
const batches: number[] = [];
const partitionIds = new Set<string>();
let maxActiveBatches = 0;
let maxOpenPartitions = 0;
const events: FanOutWorkerEvent[] = [];
const { recorder, values } = createMemoryFanOutMetrics();
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

const rssStart = process.memoryUsage().rss;
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
  observe: (event) => {
    events.push(event);
    recordFanOutWorkerEvent(recorder, event);
  },
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
        cellIds.map((cellId, index) => {
          const partitionId = `p${index % 7}`;
          partitionIds.add(partitionId);
          return [cellId, { ...route, partitionId }];
        }),
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
    maxOpenPartitions = Math.max(maxOpenPartitions, event.partitions ?? 0);
    recordFanOutRouteBatch(recorder, event);
  },
});
const ordinals: PrincipalOrdinalPort = {
  getOrCreate: () => 0,
  getByDid: () => undefined,
  getManyByDid: () => new Map(),
  resolveMany: (values) => new Map(values.map((ordinal) => [ordinal, `did:${ordinal}`])),
};
const receipts = createDeliveryReceiptStore(memoryObjectStore());
const deliveryStarted = performance.now();
while (
  await runNextFanOutDeliveryChunk({
    queue,
    principalOrdinals: ordinals,
    inboxDelivery: routed,
    cellIdForPrincipal: (did) => `cell:${Number(did.slice(4)) % 113}`,
    receipts,
    now: () => 0,
    observe: (event) => {
      events.push(event);
      recordFanOutWorkerEvent(recorder, event);
    },
  })
) {}
const deliveryMs = performance.now() - deliveryStarted;
const chunks = queue.listWorkloadChunks(jobId);
const peakRss = Math.max(rssStart, process.memoryUsage().rss);
const receipt = events.find((event) => event.type === "receipt");

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
    profile: profileName,
    targets,
    peakRssBytes: peakRss,
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
      maxOpenPartitions,
      partitions: partitionIds.size,
    },
    receipts: {
      available: receipt?.type === "receipt" ? receipt.available : false,
      fragmentBytes: receipt?.type === "receipt" ? (receipt.fragmentBytes ?? 0) : 0,
      fragmentCount: receipt?.type === "receipt" ? (receipt.fragmentCount ?? 0) : 0,
      targetCardinality: receipt?.type === "receipt" ? (receipt.targetCardinality ?? 0) : 0,
    },
    bounds: {
      pageSize,
      chunkSize,
      batchSize,
      concurrency,
    },
    metrics: Object.fromEntries(values),
    observations: events.length,
  }),
);

function profileArg(): keyof typeof profiles {
  const prefix = "--profile=";
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "ci";
  if (raw === "ci" || raw === "stress" || raw === "million") return raw;
  throw new RangeError("profile must be ci, stress, or million");
}

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

function memoryObjectStore(): ObjectStorePort {
  const objects = new Map<string, Uint8Array>();
  return {
    async putImmutable(key, bytes) {
      if (objects.has(key)) throw new Error(`object already exists: ${key}`);
      objects.set(key, bytes);
    },
    async get(key) {
      return objects.get(key);
    },
    async head(key) {
      const bytes = objects.get(key);
      return bytes === undefined ? undefined : { byteLength: bytes.byteLength };
    },
    async listPrefix(prefix) {
      return [...objects.keys()].filter((key) => key.startsWith(prefix));
    },
    async listChildPrefixes(parent, opts) {
      const root = parent.replace(/\/$/, "");
      const prefixes = [
        ...new Set(
          [...objects.keys()]
            .filter((key) => key.startsWith(`${root}/`))
            .map((key) => key.slice(0, key.indexOf("/", root.length + 1))),
        ),
      ].sort();
      const limit = opts?.limit ?? 64;
      return prefixes
        .filter((prefix) => opts?.after === undefined || prefix > opts.after)
        .slice(0, limit);
    },
    async deletePrefix(prefix) {
      for (const key of [...objects.keys()]) {
        if (key.startsWith(prefix)) objects.delete(key);
      }
    },
  };
}
