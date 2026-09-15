import { createResolveCellInboxDelivery, principalHomeCellId } from "@khoralabs/colonnade";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import {
  bootstrapHostSearch,
  buildPercolatorCandidateFromPost,
  createCatalogPublicPostFeedReader,
  createDeliveryReceiptStore,
  createFanOutMaintenanceTick,
  createKhoraHost,
  createLocalFilesystemObjectStore,
  createS3ObjectStore,
  DEFAULT_HOST_SEARCH_NAMESPACE_ROOT,
  type FanOutWorkerEvent,
  type KhoraHostContext,
  parseInviteSeedTokens,
  popInboxDrainItemsForDid,
  readInvitePepper,
  runFanOutMissingJobReconciliation,
  runOrphanReceiptGc,
  startEmbeddingRetryWorker,
  startFanOutWorkers,
  validateInviteEnvConfig,
} from "@khoralabs/khora-host";
import type { KhoraEncryptionContext } from "@khoralabs/khora-host/bootstrap";
import {
  createKhoraInvitesSqliteRepo,
  createSqliteKhoraHostFoundation,
} from "@khoralabs/khora-host/sqlite";
import {
  ensureCustomSqliteForExtensions,
  getMemoriesSqliteDatabase,
} from "@khoralabs/memories-node/sqlite";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";
import { logger } from "./logger";
import { migrateLegacyPendingEmbeddingsFromMemoriesDb } from "./migrate-legacy-pending-embeddings";
import {
  assertKhoraMemoriesDbPathUnset,
  type KhoraMemoriesBootstrapConfig,
} from "./services/memories";

export type BootstrapKhoraHostOpts = {
  hostDbPath: string;
  /** Colonnade publication catalog (separate from host meta). */
  catalogDbPath: string;
  /** Auth nonce replay store (separate from host meta). */
  authNoncesDbPath: string;
  /** Percolator standing_queries (separate from host meta). */
  percolatorDbPath: string;
  cellsDir: string;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: KhoraMemoriesBootstrapConfig;
  encryption: KhoraEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
};

export type KhoraHostBootstrap = {
  ctx: KhoraHostContext;
};

export async function bootstrapKhoraHost(
  opts: BootstrapKhoraHostOpts,
): Promise<KhoraHostBootstrap> {
  // Must run before any bun:sqlite open. Host/side DBs otherwise load Bun's
  // bundled SQLite first, and setCustomSQLite becomes a no-op — breaking sqlite-vec.
  if (opts.memories !== undefined) {
    ensureCustomSqliteForExtensions();
  }

  const encryption = opts.encryption;
  let memories: ReturnType<typeof bootstrapHostSearch> | undefined;
  let invitesRepoValue: ReturnType<typeof createKhoraInvitesSqliteRepo> | undefined;

  const foundation = await createSqliteKhoraHostFoundation({
    hostDbPath: opts.hostDbPath,
    catalogDbPath: opts.catalogDbPath,
    authNoncesDbPath: opts.authNoncesDbPath,
    percolatorDbPath: opts.percolatorDbPath,
    cellsDir: opts.cellsDir,
    useCellWorkers: opts.useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
    async onPrincipalTeardown(_principalId, profileId) {
      await memories?.indexer.deleteProfile(profileId);
    },
    onPhase1Teardown(principalId, profileId) {
      invitesRepoValue?.deleteTokensForPrincipal(principalId);
      void memories?.indexer.deleteProfile(profileId);
    },
  });

  const seedTokens = parseInviteSeedTokens(process.env.KHORA_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createKhoraInvitesSqliteRepo(foundation.hostDb, pepper);
    repo.insertSeedInviteTokens(seedTokens);
    const rootPlain = repo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      logger.error({ rootPlain }, "new root invite plaintext — store securely");
    }
    invitesRepoValue = repo;
  }

  if (opts.memories !== undefined) {
    assertKhoraMemoriesDbPathUnset();

    const stack = createLocalSqliteServiceStack({
      dataDir: opts.memories.memoriesDataDir,
      ...(encryption.sqlCipherKey !== undefined ? { sqlCipherKey: encryption.sqlCipherKey } : {}),
    });

    const handle = await stack.service.getHandle(opts.memories.databaseId);
    const pendingEmbeddings = foundation.persistence.pendingEmbeddings;
    const syncPersistence = handle.sync?.syncPersistence;
    if (syncPersistence !== undefined) {
      const migrated = migrateLegacyPendingEmbeddingsFromMemoriesDb(
        getMemoriesSqliteDatabase(syncPersistence),
        pendingEmbeddings,
      );
      if (migrated > 0) {
        logger.info({ migrated }, "migrated legacy pending embeddings from memories sqlite");
      }
    }
    let embeddingRetryWorker: ReturnType<typeof startEmbeddingRetryWorker> | undefined;

    memories = bootstrapHostSearch({
      persistence: handle.persistence,
      close: () => {
        embeddingRetryWorker?.stop();
        void handle.close();
      },
      persistenceClient: foundation.persistenceClient,
      postResolver: foundation.postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
      onEmbeddingFailure: ({ namespace, memoryKey, sourceKey, text }) => {
        pendingEmbeddings.enqueue({ namespace, memoryKey, sourceKey, text });
      },
    });
    embeddingRetryWorker = startEmbeddingRetryWorker({
      queue: pendingEmbeddings,
      client: memories.client,
      embeddingModel: opts.memories.embeddingModel,
    });
  }

  const publicPostFeed = createCatalogPublicPostFeedReader({
    catalog: foundation.cluster.catalog,
    tenantKey: foundation.tenantKey,
    postResolver: foundation.postResolver,
  });
  const receiptObjects = configuredReceiptObjectStore();
  const deliveryReceiptStore =
    receiptObjects === undefined ? undefined : createDeliveryReceiptStore(receiptObjects);
  const ctx = createKhoraHost({
    persistence: foundation.persistence,
    tenantKey: foundation.tenantKey,
    cluster: foundation.cluster,
    publicationClient: foundation.publicationClient,
    cellPoolCount: foundation.cellPoolCount,
    auth: foundation.auth,
    principalLifecycle: foundation.principalLifecycle,
    registration: foundation.registration,
    health: foundation.health,
    adminStats: foundation.adminStats,
    hostSpec: foundation.hostSpec,
    outboxPayloadCodec: foundation.outboxPayloadCodec,
    subscriptions: foundation.subscriptions,
    publicPostFeed,
    ...(invitesRepoValue !== undefined ? { invitesRepo: invitesRepoValue } : {}),
    ...(memories !== undefined ? { search: memories } : {}),
    ...(deliveryReceiptStore !== undefined ? { deliveryReceiptStore } : {}),
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
  });
  let gcAfterPrefix: string | undefined;
  const fanOutWorkers = startFanOutWorkers({
    planner: {
      queue: foundation.persistence.fanOutQueue,
      percolator: foundation.subscriptions.percolator,
      candidateForJob(job) {
        const post = job.postMetadata as KhoraPost;
        return buildPercolatorCandidateFromPost({
          post,
          authorPrincipalId: job.authorPrincipalId,
          authorProfileId: post.authorProfileId ?? job.authorPrincipalId,
          namespaceRoot: opts.memories?.namespaceRoot ?? DEFAULT_HOST_SEARCH_NAMESPACE_ROOT,
          lexicalText: JSON.stringify(post),
          now: job.createdAtMs,
        });
      },
      observe: observeFanOut,
      ...(deliveryReceiptStore !== undefined ? { receipts: deliveryReceiptStore } : {}),
    },
    delivery: {
      queue: foundation.persistence.fanOutQueue,
      principalOrdinals: foundation.persistence.principalOrdinals,
      inboxDelivery: createResolveCellInboxDelivery(foundation.cluster.resolveCell),
      cellIdForPrincipal: foundation.cluster.assignPrincipalToCell,
      observe: observeFanOut,
      ...(deliveryReceiptStore !== undefined ? { receipts: deliveryReceiptStore } : {}),
      async onDelivered(dids) {
        await Promise.all(
          dids.map(async (did) => {
            if ((ctx.host.inboxHub?.listenerCount(did) ?? 0) === 0) return;
            const items = await popInboxDrainItemsForDid(ctx, did);
            ctx.host.inboxHub?.broadcast(did, { type: "drain", items });
          }),
        );
      },
    },
    onTick: createFanOutMaintenanceTick({
      reconcileEveryMs: envIntervalMs("KHORA_FANOUT_RECONCILE_INTERVAL_MS", 60_000),
      gcEveryMs: envIntervalMs("KHORA_RECEIPT_GC_INTERVAL_MS", 3_600_000),
      reconcile: async () => {
        await runFanOutMissingJobReconciliation({
          tenantKey: foundation.tenantKey,
          queue: foundation.persistence.fanOutQueue,
          listPrincipals: (listOpts) =>
            foundation.persistence.usernameIndex.listPrincipals(listOpts),
          listOutbox: (principalId) =>
            foundation.postResolver.listAuthorOutboxRecords({
              authorPrincipalId: principalId,
              authorCellId: principalHomeCellId(principalId),
              tenantKey: foundation.tenantKey,
              limit: 256,
            }),
          resolvePost: (postId) => foundation.postResolver.resolvePostById(postId),
        });
      },
      ...(receiptObjects === undefined
        ? {}
        : {
            gc: async () => {
              const gc = await runOrphanReceiptGc({
                objects: receiptObjects,
                isReferenced: (jobId) =>
                  foundation.persistence.fanOutQueue.getJob(jobId) !== undefined,
                nowMs: Date.now(),
                retentionMs: receiptGcRetentionMs(),
                ...(gcAfterPrefix !== undefined ? { afterPrefix: gcAfterPrefix } : {}),
              });
              gcAfterPrefix = gc.nextAfterPrefix;
            },
          }),
    }),
  });
  ctx.drainWorkers = () => fanOutWorkers.stop();
  const closeCluster = foundation.cluster.close.bind(foundation.cluster);
  foundation.cluster.close = () => {
    void fanOutWorkers.stop();
    closeCluster();
  };
  return { ctx };
}

function configuredReceiptObjectStore() {
  const bucket = process.env.KHORA_RECEIPT_S3_BUCKET?.trim();
  if (bucket !== undefined && bucket.length > 0) {
    const endpoint = process.env.KHORA_RECEIPT_S3_ENDPOINT?.trim();
    const region = process.env.KHORA_RECEIPT_S3_REGION?.trim() || process.env.AWS_REGION?.trim();
    const prefix = process.env.KHORA_RECEIPT_S3_PREFIX?.trim();
    return createS3ObjectStore({
      bucket,
      ...(prefix !== undefined && prefix.length > 0 ? { prefix } : {}),
      ...(endpoint !== undefined && endpoint.length > 0
        ? {
            clientConfig: {
              endpoint,
              forcePathStyle: true,
              ...(region !== undefined && region.length > 0 ? { region } : { region: "us-east-1" }),
            },
          }
        : region !== undefined && region.length > 0
          ? { clientConfig: { region } }
          : {}),
    });
  }
  const directory = process.env.KHORA_RECEIPT_DIR?.trim();
  return directory !== undefined && directory.length > 0
    ? createLocalFilesystemObjectStore(directory)
    : undefined;
}

function envIntervalMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function receiptGcRetentionMs(): number {
  const raw = Number(process.env.KHORA_RECEIPT_GC_RETENTION_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3_600_000;
}

function observeFanOut(event: FanOutWorkerEvent): void {
  if (event.type === "receipt" && !event.available) {
    logger.warn({ fanOut: event }, "fan-out receipt unavailable");
  } else {
    logger.debug({ fanOut: event }, "fan-out worker");
  }
}
