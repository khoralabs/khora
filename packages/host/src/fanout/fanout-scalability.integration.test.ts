import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type CellNodeClient,
  type CellRoute,
  GroupedPartitionPersistence,
  RoutedInboxDelivery,
} from "@khoralabs/colonnade";
import { createTestOutboxPayloadCodec } from "@khoralabs/colonnade/crypto";
import { SqliteCellPersistence } from "@khoralabs/colonnade/sqlite";
import { createPercolator } from "@khoralabs/percolator";
import {
  createInMemoryPercolatorPersistence,
  type PercolatorPersistence,
} from "@khoralabs/percolator/persistence";
import { createKhoraHostSqlitePersistence } from "../persistence/sqlite/khora-persistence";
import { createLocalFilesystemObjectStore } from "../receipts/object-store";
import { createDeliveryReceiptReader } from "../receipts/receipt-reader";
import { createDeliveryReceiptStore } from "../receipts/receipt-store";
import { runNextFanOutDeliveryChunk, runNextFanOutPlanningJob } from "./workers";

const scale =
  process.env.KHORA_SCALE_TEST === "1"
    ? { targets: 100_000, posts: 2, partitions: 16, nodes: 4, pageSize: 256, chunkSize: 1_000 }
    : process.env.KHORA_FANOUT_CI_MATRIX === "1"
      ? { targets: 2_000, posts: 50, partitions: 16, nodes: 4, pageSize: 64, chunkSize: 250 }
      : { targets: 36, posts: 8, partitions: 3, nodes: 2, pageSize: 7, chunkSize: 10 };

const TARGETS = scale.targets;
const POSTS = scale.posts;
const PAGE_SIZE = scale.pageSize;
const CHUNK_SIZE = scale.chunkSize;
const BATCH_SIZE = 2;
const CONCURRENCY = 2;

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test(
  "write storm fans out durably with bounded pages, chunks, batches, and concurrency",
  async () => {
    const hostDb = new Database(":memory:");
    const host = createKhoraHostSqlitePersistence(hostDb);
    const basePercolator = createInMemoryPercolatorPersistence();
    const pageSizes: number[] = [];
    const persistence: PercolatorPersistence = {
      ...basePercolator,
      async scanActiveQueries(opts) {
        const page = await basePercolator.scanActiveQueries(opts);
        pageSizes.push(page.length);
        return page;
      },
    };
    const percolator = createPercolator({ persistence });
    const dids = Array.from({ length: TARGETS }, (_, index) => `did:recipient:${index}`);
    for (const [index, did] of dids.entries()) {
      const ordinal = host.principalOrdinals.getOrCreate(did);
      await percolator.registerQuery(
        {
          id: `query-${index}`,
          ownerId: did,
          ownerOrdinal: ordinal,
          search: { content: {}, options: { labels: { some: ["post"] } } },
        },
        0,
      );
    }

    const routes = new Map<string, CellRoute>();
    const cells = new Map<string, SqliteCellPersistence>();
    const partitions = new Map<string, GroupedPartitionPersistence>();
    const codec = createTestOutboxPayloadCodec();
    for (let index = 0; index < scale.partitions; index++) {
      const partitionId = `partition-${index}`;
      partitions.set(
        partitionId,
        new GroupedPartitionPersistence({
          partitionId,
          epoch: 1,
          openHome(cellId) {
            let cell = cells.get(cellId);
            if (cell === undefined) {
              cell = new SqliteCellPersistence(new Database(":memory:"), cellId, {
                outboxPayloadCodec: codec,
              });
              cells.set(cellId, cell);
            }
            return cell;
          },
        }),
      );
    }
    for (const [index, did] of dids.entries()) {
      routes.set(`cell-${did}`, {
        nodeId: `node-${index % scale.nodes}`,
        endpoint: "in-process",
        partitionId: `partition-${index % scale.partitions}`,
        backendKind: "sqlite",
        epoch: 1,
      });
    }

    const batchSizes: number[] = [];
    let activeBatches = 0;
    let maxActiveBatches = 0;
    const client: CellNodeClient = {
      async enqueueMany(_route, batch) {
        batchSizes.push(batch.deliveries.length);
        activeBatches++;
        maxActiveBatches = Math.max(maxActiveBatches, activeBatches);
        await Promise.resolve();
        try {
          const partition = partitions.get(batch.partitionId);
          if (!partition) throw new Error(`missing ${batch.partitionId}`);
          return await partition.enqueueMany(batch);
        } finally {
          activeBatches--;
        }
      },
    };
    const routed = new RoutedInboxDelivery({
      placement: {
        async resolveMany(cellIds) {
          return new Map(
            cellIds.flatMap((id) => {
              const route = routes.get(id);
              return route === undefined ? [] : [[id, route]];
            }),
          );
        },
      },
      client,
      concurrency: CONCURRENCY,
      maxBatchSize: BATCH_SIZE,
    });
    let interruptOnce = true;
    const inboxDelivery = {
      async deliver(input: Parameters<typeof routed.deliver>[0]) {
        const result = await routed.deliver(input);
        if (interruptOnce) {
          interruptOnce = false;
          throw new Error("simulated worker interruption after durable delivery");
        }
        return result;
      },
    };

    const objects = new Map<string, Uint8Array>();
    const receiptStore =
      process.env.KHORA_FANOUT_RECEIPT_FS === "1"
        ? createLocalFilesystemObjectStore(
            await mkdtemp(path.join(tmpdir(), "khora-fanout-receipts-")).then((directory) => {
              temporaryDirectories.push(directory);
              return directory;
            }),
          )
        : {
            get: async (key: string) => objects.get(key),
            putImmutable: async (key: string, bytes: Uint8Array) => {
              if (objects.has(key)) throw new Error("immutable object exists");
              objects.set(key, bytes);
            },
            head: async (key: string) => {
              const bytes = objects.get(key);
              return bytes === undefined ? undefined : { byteLength: bytes.byteLength };
            },
            listPrefix: async (prefix: string) =>
              [...objects.keys()].filter((key) => key.startsWith(prefix)),
            listChildPrefixes: async () => [],
            deletePrefix: async (prefix: string) => {
              for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key);
            },
          };
    const receipts = createDeliveryReceiptStore(receiptStore);
    const postIds = Array.from({ length: POSTS }, (_, index) => `storm-post-${index}`);
    const jobIds = new Map<string, string>();
    for (const [index, postId] of postIds.entries()) {
      jobIds.set(
        postId,
        host.fanOutQueue.enqueuePlanning(
          {
            tenantKey: "tenant",
            postId,
            sourceCellId: "author-cell",
            sourceRecordKey: `record-${postId}`,
            sourceContentHash: index.toString(16).padStart(64, "0"),
            cellPoolCount: 4,
            authorPrincipalId: "did:author",
            postKind: "post",
            postMetadata: { storm: true },
            visibility: "public",
            fanOutPolicy: { mode: "push" },
          },
          0,
        ),
      );
    }
    let now = 20;
    const planner = () =>
      runNextFanOutPlanningJob({
        queue: host.fanOutQueue,
        percolator,
        candidateForJob: (job) => ({
          candidateId: job.postId,
          authorId: job.authorPrincipalId,
          namespace: "global/posts",
          labelKinds: ["post"],
          content: {},
          createdAtMs: 0,
        }),
        receipts,
        pageSize: PAGE_SIZE,
        chunkSize: CHUNK_SIZE,
        now: () => now,
      });
    await drain(planner, 4);

    const interrupted = host.fanOutQueue.tryClaimDelivery(20, 5);
    expect(interrupted).toBeDefined();
    const delivery = () =>
      runNextFanOutDeliveryChunk({
        queue: host.fanOutQueue,
        principalOrdinals: host.principalOrdinals,
        inboxDelivery,
        cellIdForPrincipal: (did) => `cell-${did}`,
        receipts,
        leaseMs: 5,
        retryDelayMs: 0,
        now: () => 25,
      });
    await drain(delivery, 4);

    expect(Math.max(...pageSizes)).toBe(PAGE_SIZE);
    expect(pageSizes.length).toBeGreaterThan(POSTS * 2);
    const firstPostId = required(postIds[0]);
    const firstJobId = required(jobIds.get(firstPostId));
    expect(
      Math.max(...host.fanOutQueue.listWorkloadChunks(firstJobId).map((c) => c.records.length)),
    ).toBe(CHUNK_SIZE);
    expect(host.fanOutQueue.listWorkloadChunks(firstJobId)).toHaveLength(
      Math.ceil(TARGETS / CHUNK_SIZE),
    );
    expect(new Set(batchSizes).size).toBeGreaterThan(1);
    expect(Math.max(...batchSizes)).toBe(BATCH_SIZE);
    expect(maxActiveBatches).toBe(4 * CONCURRENCY);

    for (const postId of postIds) {
      expect(host.fanOutQueue.getJob(required(jobIds.get(postId)))).toMatchObject({
        status: "completed",
        plannedTargetCount: TARGETS,
        routedTargetCount: TARGETS,
      });
    }
    for (const did of dids) {
      const cell = required(cells.get(`cell-${did}`));
      const page = await cell.listPendingInboxEntries({
        cell_id: `cell-${did}`,
        tenant_key: "tenant",
        principal_id: did,
        limit: Math.max(100, POSTS),
        cursor: "",
      });
      expect(page.entries).toHaveLength(POSTS);
    }

    const reader = createDeliveryReceiptReader({
      tenantKey: "tenant",
      queue: host.fanOutQueue,
      ordinals: host.principalOrdinals,
      store: receipts,
    });
    expect(await reader.summary(firstPostId)).toMatchObject({
      targetCount: TARGETS,
      deliveredCount: TARGETS,
      failedCount: 0,
      receiptsAvailable: true,
    });
    expect(await reader.contains(firstPostId, required(dids[17]))).toEqual({
      available: true,
      targeted: true,
      status: "delivered",
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await reader.targets(firstPostId, { limit: 8, ...(cursor ? { cursor } : {}) });
      if (!page?.available) throw new Error("receipt page unavailable");
      seen.push(...page.items.map(({ did }) => did));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(dids);

    const absentPost = "object-store-absent";
    const absentJobId = host.fanOutQueue.enqueuePlanning(
      {
        tenantKey: "tenant",
        postId: absentPost,
        sourceCellId: "author-cell",
        sourceRecordKey: "record-absent",
        sourceContentHash: "b".repeat(64),
        cellPoolCount: 4,
        authorPrincipalId: "did:author",
        postKind: "post",
        postMetadata: {},
        visibility: "public",
        fanOutPolicy: { mode: "push" },
      },
      30,
    );
    now = 30;
    await drain(planner, 1);
    await drain(
      () =>
        runNextFanOutDeliveryChunk({
          queue: host.fanOutQueue,
          principalOrdinals: host.principalOrdinals,
          inboxDelivery: routed,
          cellIdForPrincipal: (did) => `cell-${did}`,
          now: () => 30,
        }),
      1,
    );
    expect(host.fanOutQueue.getJob(absentJobId)?.status).toBe("completed");
    expect(
      await createDeliveryReceiptReader({
        tenantKey: "tenant",
        queue: host.fanOutQueue,
        ordinals: host.principalOrdinals,
        store: createDeliveryReceiptStore(),
      }).summary(absentPost),
    ).toMatchObject({ deliveredCount: TARGETS, receiptsAvailable: false });

    const beforeCatalogPull = await inboxCount(cells, dids);
    const catalogPost = "catalog-pull-post";
    const catalogJobId = host.fanOutQueue.enqueuePlanning(
      {
        tenantKey: "tenant",
        postId: catalogPost,
        sourceCellId: "author-cell",
        sourceRecordKey: "record-catalog",
        sourceContentHash: "c".repeat(64),
        cellPoolCount: 4,
        authorPrincipalId: "did:author",
        postKind: "post",
        postMetadata: {},
        visibility: "public",
        fanOutPolicy: { mode: "catalog-pull" },
      },
      40,
    );
    now = 40;
    await drain(planner, 1);
    expect(host.fanOutQueue.getJob(catalogJobId)).toMatchObject({
      status: "completed",
      deliveryMode: "pull",
      routedTargetCount: 0,
    });
    expect(host.fanOutQueue.getJob(catalogJobId)?.plannedTargetCount).toBeGreaterThan(0);
    expect(await inboxCount(cells, dids)).toBe(beforeCatalogPull);
    hostDb.close();
  },
  { timeout: 600_000 },
);

async function drain(run: () => Promise<boolean>, concurrency: number): Promise<void> {
  while ((await Promise.all(Array.from({ length: concurrency }, run))).some(Boolean)) {}
}

async function inboxCount(
  cells: ReadonlyMap<string, SqliteCellPersistence>,
  dids: readonly string[],
): Promise<number> {
  let total = 0;
  for (const did of dids) {
    const result = await required(cells.get(`cell-${did}`)).listPendingInboxEntries({
      cell_id: `cell-${did}`,
      tenant_key: "tenant",
      principal_id: did,
      limit: Math.max(100, POSTS),
      cursor: "",
    });
    total += result.entries.length;
  }
  return total;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing integration fixture");
  return value;
}
