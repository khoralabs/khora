import type { Database } from "bun:sqlite";
import {
  bootstrapHostSearch,
  createKhoraHost,
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  type KhoraHostContext,
  parseInviteSeedTokens,
  readInvitePepper,
  startEmbeddingRetryWorker,
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
import type {
  MemoriesDatabaseCatalogStore,
  MemoriesDatabaseOntologyStore,
  MemoriesDatabaseService,
} from "@khoralabs/memories-service";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";
import { logger } from "./logger";
import {
  assertKhoraMemoriesDbPathUnset,
  type KhoraMemoriesBootstrapConfig,
} from "./services/memories";

export type BootstrapKhoraHostOpts = {
  hostDbPath: string;
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
  /** Shared host memories SQLite handle (same connection as memories-service / indexer). */
  memoriesSqliteDb?: Database;
  memoriesService?: MemoriesDatabaseService;
  memoriesOntology?: MemoriesDatabaseOntologyStore;
  memoriesCatalog?: MemoriesDatabaseCatalogStore;
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

  let memoriesSqliteDb: Database | undefined;
  let memoriesService: MemoriesDatabaseService | undefined;
  let memoriesOntology: MemoriesDatabaseOntologyStore | undefined;
  let memoriesCatalog: MemoriesDatabaseCatalogStore | undefined;

  if (opts.memories !== undefined) {
    assertKhoraMemoriesDbPathUnset();

    const stack = createLocalSqliteServiceStack({
      dataDir: opts.memories.memoriesDataDir,
      ...(encryption.sqlCipherKey !== undefined ? { sqlCipherKey: encryption.sqlCipherKey } : {}),
    });
    memoriesService = stack.service;
    memoriesOntology = stack.ontology;
    memoriesCatalog = stack.catalog;

    const handle = await stack.service.getHandle(opts.memories.databaseId);
    const syncPersistence = handle.sync?.syncPersistence;
    if (syncPersistence === undefined) {
      throw new Error("Host memories handle is missing sync SQLite persistence");
    }
    memoriesSqliteDb = getMemoriesSqliteDatabase(syncPersistence);
    ensurePendingEmbeddingsTable(memoriesSqliteDb);

    memories = bootstrapHostSearch({
      persistence: handle.persistence,
      close: () => {
        void handle.close();
      },
      persistenceClient: foundation.persistenceClient,
      postResolver: foundation.postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
      onEmbeddingFailure: ({ namespace, memoryKey, sourceKey, text }) => {
        if (!memoriesSqliteDb) return;
        enqueuePendingEmbedding(memoriesSqliteDb, { namespace, memoryKey, sourceKey, text });
      },
    });
    startEmbeddingRetryWorker({
      db: memoriesSqliteDb,
      client: memories.client,
      embeddingModel: opts.memories.embeddingModel,
    });
  }

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
    ...(invitesRepoValue !== undefined ? { invitesRepo: invitesRepoValue } : {}),
    ...(memories !== undefined ? { search: memories } : {}),
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
  });
  return {
    ctx,
    ...(memoriesSqliteDb !== undefined ? { memoriesSqliteDb } : {}),
    ...(memoriesService !== undefined ? { memoriesService } : {}),
    ...(memoriesOntology !== undefined ? { memoriesOntology } : {}),
    ...(memoriesCatalog !== undefined ? { memoriesCatalog } : {}),
  };
}
