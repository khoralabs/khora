import type { Database } from "bun:sqlite";
import { ColonnadePublicationClient } from "@khoralabs/colonnade";
import {
  EnvKeyProvider,
  openMaybeEncryptedDatabaseSync,
  outboxKeyBytesToHex,
} from "@khoralabs/colonnade/crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade/sqlite";
import { AuthError, createSignedRequestAuth } from "@khoralabs/khora-auth";
import {
  bootstrapHostSearch,
  bootstrapHostSubscriptions,
  createColonnadePostResolver,
  createKhoraHost,
  createKhoraRegistrationApi,
  createPrincipalLifecycle,
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  type KhoraHostContext,
  parseInviteSeedTokens,
  readInvitePepper,
  startEmbeddingRetryWorker,
  validateInviteEnvConfig,
} from "@khoralabs/khora-host";
import { createHostPersistenceClient } from "@khoralabs/khora-host/persistence";
import {
  applyKhoraSqlitePragmas,
  createKhoraAdminStatsPort,
  createKhoraHostHealthPort,
  createKhoraHostSpecPort,
  createKhoraInvitesSqliteRepo,
  createSqliteNonceStore,
  openKhoraHostSqlitePersistence,
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
import {
  createPercolatorSqlitePersistence,
  ensurePercolatorSchema,
} from "@khoralabs/percolator/sqlite";
import type { KhoraEncryptionContext } from "./encryption";
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

function openSideDb(path: string, sqlCipherKey?: string): Database {
  const db = openMaybeEncryptedDatabaseSync(path, { create: true }, sqlCipherKey);
  applyKhoraSqlitePragmas(db);
  return db;
}

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

  const useCellWorkers = opts.useCellWorkers;
  const encryption = opts.encryption;
  const encryptionProvider = new EnvKeyProvider();
  const outboxKey = await encryptionProvider.getOutboxFieldKey();
  const { persistence, hostDb } = await openKhoraHostSqlitePersistence({
    hostDbPath: opts.hostDbPath,
    sqlCipherKey: encryption.sqlCipherKey,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
  const authNoncesDb = openSideDb(opts.authNoncesDbPath, encryption.sqlCipherKey);
  const percolatorDb = openSideDb(opts.percolatorDbPath, encryption.sqlCipherKey);
  ensurePercolatorSchema(percolatorDb);
  const tenantKey = opts.tenantKey ?? "khora";
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: opts.cellsDir,
    useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: outboxKeyBytesToHex(outboxKey),
    },
  });
  const cellPoolCount = cluster.cellPoolCount;
  const publicationClient = new ColonnadePublicationClient(
    cluster.resolveCell,
    cluster.inboxDelivery,
  );
  const postResolver = createColonnadePostResolver(cluster);
  const percolator = bootstrapHostSubscriptions({
    persistence: createPercolatorSqlitePersistence(percolatorDb),
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
  });
  let memories: ReturnType<typeof bootstrapHostSearch> | undefined;
  const principalLifecycle = createPrincipalLifecycle({
    persistence,
    purgePrincipalCells: async (principalId) => {
      const cellId = cluster.assignPrincipalToCell(principalId);
      await cluster.resolveCell(cellId).purgePrincipal(principalId);
    },
    async onPrincipalTeardown(principalId, profileId) {
      for (const query of await percolator.percolator.listQueriesByOwner(principalId)) {
        await percolator.percolator.deactivateQuery(query.id);
      }
      await memories?.indexer.deleteProfile(profileId);
    },
    onPhase1Teardown(principalId, profileId) {
      invitesRepoValue?.deleteTokensForPrincipal(principalId);
      void memories?.indexer.deleteProfile(profileId);
    },
  });
  const registration = createKhoraRegistrationApi({ persistence, principalLifecycle });
  const health = createKhoraHostHealthPort(hostDb);
  const hostSpec = createKhoraHostSpecPort({ hostDb, tenantKey });
  const adminStats = createKhoraAdminStatsPort({
    hostDb,
    tenantKey,
  });
  const auth = createSignedRequestAuth({
    nonceStore: createSqliteNonceStore(authNoncesDb),
    assertPrincipalAllowed(did) {
      const status = persistence.agentAccountStatus.getStatus(did);
      if (status === "suspended") throw new AuthError("agent account suspended", 403);
      if (status === "deleted") throw new AuthError("agent account deleted", 403);
    },
  });
  const persistenceClient = createHostPersistenceClient(persistence);

  const seedTokens = parseInviteSeedTokens(process.env.KHORA_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepoValue: ReturnType<typeof createKhoraInvitesSqliteRepo> | undefined;
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createKhoraInvitesSqliteRepo(hostDb, pepper);
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
      persistenceClient,
      postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
      onEmbeddingFailure: ({ namespace, memoryKey, text }) => {
        if (!memoriesSqliteDb) return;
        enqueuePendingEmbedding(memoriesSqliteDb, { namespace, memoryKey, text });
      },
    });
    startEmbeddingRetryWorker({
      db: memoriesSqliteDb,
      persistence: handle.persistence,
      embeddingModel: opts.memories.embeddingModel,
    });
  }

  const ctx = createKhoraHost({
    persistence,
    tenantKey,
    cluster,
    publicationClient,
    cellPoolCount,
    auth,
    principalLifecycle,
    registration,
    health,
    adminStats,
    hostSpec,
    outboxPayloadCodec: encryption.outboxPayloadCodec,
    ...(invitesRepoValue !== undefined ? { invitesRepo: invitesRepoValue } : {}),
    ...(memories !== undefined ? { search: memories } : {}),
    subscriptions: percolator,
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
