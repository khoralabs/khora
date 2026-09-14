import { expect, test } from "bun:test";
import type { InboxDelivery, InboxDeliveryResult } from "@khoralabs/colonnade";
import type { Percolator } from "@khoralabs/percolator";
import { createInMemoryFanOutQueue } from "../persistence/core/in-memory-fan-out-queue";
import type { FanOutPlanningJobInput, PrincipalOrdinalPort } from "../persistence/core/port";
import { createDeliveryReceiptStore, NoopDeliveryReceiptStore } from "../receipts/receipt-store";
import { runNextFanOutDeliveryChunk, runNextFanOutPlanningJob } from "./workers";

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
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 14 })).toBe(false);
  expect(await runNextFanOutDeliveryChunk({ ...deps, now: () => 15 })).toBe(true);
  expect(queue.getJob(id)).toMatchObject({ status: "completed", routedTargetCount: 2 });
});
