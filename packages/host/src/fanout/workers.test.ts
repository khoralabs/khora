import { expect, test } from "bun:test";
import type { InboxDelivery, InboxDeliveryResult } from "@khoralabs/colonnade";
import type { Percolator } from "@khoralabs/percolator";
import { createInMemoryFanOutQueue } from "../persistence/core/in-memory-fan-out-queue";
import type { FanOutPlanningJobInput, PrincipalOrdinalPort } from "../persistence/core/port";
import { createDeliveryReceiptStore, NoopDeliveryReceiptStore } from "../receipts/receipt-store";
import {
  type FanOutWorkerEvent,
  runNextFanOutDeliveryChunk,
  runNextFanOutPlanningJob,
  startFanOutWorkers,
} from "./workers";

const input: FanOutPlanningJobInput = {
  tenantKey: "tenant",
  postId: "post",
  sourceCellId: "author-cell",
  sourceRecordKey: "record",
  sourceContentHash: "a".repeat(64),
  cellPoolCount: 1,
  authorPrincipalId: "author",
  postKind: "post",
  postMetadata: {},
  visibility: "public",
  fanOutPolicy: "push",
};

function percolator(ordinals: number[]): Percolator {
  return {
    async *evaluateCandidateStream() {
      for (const ordinal of ordinals) {
        yield {
          ownerId: `did:${ordinal}`,
          ownerOrdinal: ordinal,
          matches: [{ queryId: `q${ordinal}` }],
        };
      }
    },
  } as unknown as Percolator;
}

function ordinals(): PrincipalOrdinalPort {
  return {
    getOrCreate: () => 0,
    getByDid: () => undefined,
    getManyByDid: () => new Map(),
    resolveMany: (values) => new Map(values.map((value) => [value, `did:${value}`])),
  };
}

test("planner deduplicates and writes bounded chunks without receipt storage", async () => {
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning(input, 0);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([1, 1, 2, 3, 4, 5]),
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    chunkSize: 2,
    now: () => 0,
  });
  expect(queue.listWorkloadChunks(id).map(({ records }) => records.length)).toEqual([2, 2, 1]);
  expect(queue.listWorkloadChunks(id)[0]?.records[0]?.subscriptionMatches).toHaveLength(2);
  expect(queue.getJob(id)?.plannedTargetCount).toBe(5);
});

test("planner preserves duplicate matches across a chunk boundary", async () => {
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning(input, 0);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([1, 1, 2]),
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    chunkSize: 1,
    now: () => 0,
  });
  expect(queue.listWorkloadChunks(id)[0]?.records[0]?.subscriptionMatches).toHaveLength(2);
});

test("zero-target planning writes an empty receipt manifest", async () => {
  const objects = new Map<string, Uint8Array>();
  const receipts = createDeliveryReceiptStore({
    get: async (key) => objects.get(key),
    putImmutable: async (key, bytes) => {
      objects.set(key, bytes);
    },
    head: async (key) => {
      const bytes = objects.get(key);
      return bytes === undefined ? undefined : { byteLength: bytes.byteLength };
    },
    listPrefix: async (prefix) => [...objects.keys()].filter((key) => key.startsWith(prefix)),
    listChildPrefixes: async () => [],
    deletePrefix: async (prefix) => {
      for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key);
    },
  });
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning(input, 0);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([]),
    receipts,
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    now: () => 0,
  });
  expect(await receipts.getManifest(id)).toMatchObject({
    jobId: id,
    receipts: { target: [], delivered: [], failed: [] },
  });
  expect(queue.getJob(id)?.status).toBe("completed");
});

test("catalog-pull completes durably without planning targets or pushing inboxes", async () => {
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning({ ...input, fanOutPolicy: "catalog-pull" }, 0);
  expect(queue.tryClaimPlanning(0, 10)).toBeDefined(); // simulate a restart with a stale lease
  let evaluated = false;
  const deps = {
    queue,
    percolator: {
      async *evaluateCandidateStream() {
        evaluated = true;
        yield* [];
      },
    } as unknown as Percolator,
    candidateForJob: () => {
      throw new Error("catalog-pull must not build a candidate");
    },
  };
  expect(await runNextFanOutPlanningJob({ ...deps, now: () => 9 })).toBe(false);
  expect(await runNextFanOutPlanningJob({ ...deps, now: () => 10 })).toBe(true);
  expect(evaluated).toBe(false);
  expect(queue.getJob(id)).toMatchObject({
    fanOutPolicy: "catalog-pull",
    status: "completed",
    attemptCount: 2,
    plannedTargetCount: 0,
    routedTargetCount: 0,
  });
  expect(queue.listWorkloadChunks(id)).toEqual([]);
  expect(queue.tryClaimDelivery(1, 10)).toBeUndefined();
});

test("catalog-pull rejects non-public jobs", () => {
  const queue = createInMemoryFanOutQueue();
  expect(() =>
    queue.enqueuePlanning({ ...input, visibility: "private", fanOutPolicy: "catalog-pull" }, 0),
  ).toThrow(/requires public catalog visibility/);
});

test("in-memory delivery claim skips pending chunks owned by failed jobs", async () => {
  const queue = createInMemoryFanOutQueue();
  const first = queue.enqueuePlanning(input, 0);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([1, 2]),
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    chunkSize: 1,
    now: () => 0,
  });
  const failed = queue.tryClaimDelivery(0, 10);
  expect(failed?.jobId).toBe(first);
  queue.failDelivery(first, 0, 0, "terminal");

  const second = queue.enqueuePlanning({ ...input, postId: "post-2" }, 1);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([3]),
    candidateForJob: () => ({
      candidateId: "post-2",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 1,
    }),
    now: () => 1,
  });
  expect(queue.tryClaimDelivery(1, 10)?.jobId).toBe(second);
});

test("planning retries use capped exponential backoff from attempt counts", async () => {
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning(input, 0);
  const boom = {
    async *evaluateCandidateStream() {
      yield { ownerId: "did:1", ownerOrdinal: 1, matches: [] };
      throw new Error("boom");
    },
  } as unknown as Percolator;
  const deps = {
    queue,
    percolator: boom,
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    backoffBaseMs: 1_000,
    backoffMaxMs: 4_000,
    maxAttempts: 5,
  };
  await runNextFanOutPlanningJob({ ...deps, now: () => 0 });
  expect(queue.getJob(id)?.availableAtMs).toBe(1_000);
  await runNextFanOutPlanningJob({ ...deps, now: () => 1_000 });
  expect(queue.getJob(id)?.availableAtMs).toBe(3_000);
  await runNextFanOutPlanningJob({ ...deps, now: () => 3_000 });
  expect(queue.getJob(id)?.availableAtMs).toBe(7_000);
});

test("delivery recovers stale leases, retries partial failures, and eventually completes", async () => {
  const queue = createInMemoryFanOutQueue();
  const id = queue.enqueuePlanning(input, 0);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([1, 2]),
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    now: () => 0,
  });
  expect(queue.tryClaimDelivery(0, 10)).toBeDefined(); // simulate a crash

  let calls = 0;
  const delivery: InboxDelivery = {
    async deliver({ targets }): Promise<InboxDeliveryResult> {
      calls++;
      const retryTarget = targets[1];
      if (retryTarget === undefined) throw new Error("missing retry target");
      return calls === 1
        ? {
            target_count: 2,
            delivered_count: 1,
            success_bitmap: new Uint8Array([1]),
            failures: [{ ...retryTarget, error: "retry", retryable: true }],
          }
        : {
            target_count: 2,
            delivered_count: 2,
            success_bitmap: new Uint8Array([3]),
          };
    },
  };
  const deps = {
    queue,
    principalOrdinals: ordinals(),
    inboxDelivery: delivery,
    cellIdForPrincipal: (did: string) => `cell:${did}`,
    receipts: new NoopDeliveryReceiptStore(),
    leaseMs: 10,
    retryDelayMs: 5,
  };
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 9 })).toBe(false);
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 10 })).toBe(true);
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 19 })).toBe(false);
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 20 })).toBe(true);
  expect(queue.getJob(id)).toMatchObject({ status: "completed", routedTargetCount: 2 });
});

test("worker observations report bounds, retries, lease recovery, and receipt availability", async () => {
  const queue = createInMemoryFanOutQueue();
  queue.enqueuePlanning(input, 0);
  expect(queue.tryClaimPlanning(0, 10)).toBeDefined();
  const events: FanOutWorkerEvent[] = [];
  const observe = (event: FanOutWorkerEvent) => events.push(event);
  await runNextFanOutPlanningJob({
    queue,
    percolator: percolator([1, 2, 3]),
    candidateForJob: () => ({
      candidateId: "post",
      authorId: "author",
      namespace: "posts",
      labelKinds: [],
      content: {},
      createdAtMs: 0,
    }),
    chunkSize: 2,
    now: () => 10,
    observe,
  });
  await runNextFanOutDeliveryChunk({
    queue,
    principalOrdinals: ordinals(),
    inboxDelivery: {
      async deliver({ targets }) {
        return {
          target_count: targets.length,
          delivered_count: targets.length,
          success_bitmap: new Uint8Array([3]),
        };
      },
    },
    cellIdForPrincipal: (did) => `cell:${did}`,
    receipts: {
      async write() {
        return { available: false, error: "object store unavailable" };
      },
      async getManifest() {
        return undefined;
      },
      async digestManifest() {
        return undefined;
      },
      async getManifestRecord() {
        return undefined;
      },
      async getFragment() {
        return undefined;
      },
    },
    now: () => 10,
    observe,
  });
  await runNextFanOutDeliveryChunk({
    queue,
    principalOrdinals: ordinals(),
    inboxDelivery: {
      async deliver({ targets }) {
        return {
          target_count: targets.length,
          delivered_count: targets.length,
          success_bitmap: new Uint8Array([1]),
        };
      },
    },
    cellIdForPrincipal: (did) => `cell:${did}`,
    receipts: {
      async write() {
        return { available: false, error: "object store unavailable" };
      },
      async getManifest() {
        return undefined;
      },
      async digestManifest() {
        return undefined;
      },
      async getManifestRecord() {
        return undefined;
      },
      async getFragment() {
        return undefined;
      },
    },
    now: () => 10,
    observe,
  });

  expect(events).toEqual([
    expect.objectContaining({
      type: "planning",
      outcome: "success",
      attempt: 2,
      queueLagMs: 10,
      leaseRecovered: true,
      targets: 3,
      chunks: 2,
    }),
    expect.objectContaining({ type: "delivery", outcome: "success", targets: 2, delivered: 2 }),
    expect.objectContaining({
      type: "receipt",
      available: false,
      error: "object store unavailable",
    }),
    expect.objectContaining({ type: "delivery", outcome: "success", targets: 1, delivered: 1 }),
  ]);
});

test("worker stop waits for an in-flight tick to finish", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  const handle = startFanOutWorkers({
    planner: {
      queue: createInMemoryFanOutQueue(),
      percolator: percolator([]),
      candidateForJob: () => {
        throw new Error("unused");
      },
    },
    delivery: {
      queue: createInMemoryFanOutQueue(),
      principalOrdinals: ordinals(),
      inboxDelivery: {
        async deliver() {
          return { target_count: 0, delivered_count: 0, success_bitmap: new Uint8Array() };
        },
      },
      cellIdForPrincipal: (did) => `cell:${did}`,
    },
    intervalMs: 60_000,
    onTick: async () => {
      started = true;
      await gate;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(started).toBe(true);
  let stopped = false;
  const stopping = handle.stop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(stopped).toBe(false);
  release?.();
  await stopping;
  expect(stopped).toBe(true);
});
