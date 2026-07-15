import type { Database } from "bun:sqlite";
import { EnvKeyProvider, outboxKeyBytesToHex } from "@khoralabs/colonnade-crypto";
import { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence-sqlite";
import { createKhoraDidAuth, createSqliteNonceStore } from "@khoralabs/khora-auth";
import {
  bootstrapKhoraMemories,
  bootstrapKhoraPercolator,
  createColonnadePostResolver,
  createHostPersistenceClient,
  createKhoraHost,
  createKhoraRegistrationApi,
  createPrincipalLifecycle,
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  type KhoraHostContext,
  startEmbeddingRetryWorker,
} from "@khoralabs/khora-host";
import { openKhoraHostSqlitePersistence } from "@khoralabs/khora-host-sqlite";
import {
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "@khoralabs/khora-invites";
import { createKhoraInvitesSqliteRepo } from "@khoralabs/khora-invites-sqlite";
import {
  createMemoriesPersistenceAsync,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import {
  createPercolatorSqlitePersistence,
  ensurePercolatorSchema,
} from "@khoralabs/percolator-sqlite";
import type { KhoraEncryptionContext } from "./encryption-context";
import { logger } from "./logger";
import type { KhoraMemoriesBootstrapConfig } from "./memories-env";
import { createKhoraAdminStatsPort } from "./ops/admin-stats-port";
import { createKhoraHostHealthPort } from "./ops/health-port";
import { createKhoraHostSpecPort } from "./ops/host-spec-port";

export type BootstrapKhoraHostOpts = {
  hostDbPath: string;
  cellsDir: string;
  cellPoolCount: number;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: KhoraMemoriesBootstrapConfig;
  encryption: KhoraEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
};

export type KhoraHostBootstrap = {
  ctx: KhoraHostContext;
  /** SQLite memories DB for server admin routes and embedding retry (sqlite backend only). */
  memoriesSqliteDb?: Database;
};

export async function bootstrapKhoraHost(
  opts: BootstrapKhoraHostOpts,
): Promise<KhoraHostBootstrap> {
  const cellPoolCount = opts.cellPoolCount;
  const useCellWorkers = opts.useCellWorkers;
  const encryption = opts.encryption;
  const encryptionProvider = new EnvKeyProvider();
  const outboxKey = await encryptionProvider.getOutboxFieldKey();
  const { persistence, hostDb } = await openKhoraHostSqlitePersistence({
    hostDbPath: opts.hostDbPath,
    encryptionProvider,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
  ensurePercolatorSchema(hostDb);
  const tenantKey = opts.tenantKey ?? "khora";
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: opts.cellsDir,
    mode: { kind: "pool", cellCount: cellPoolCount },
    useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: outboxKeyBytesToHex(outboxKey),
    },
  });
  const publicationClient = new ColonnadePublicationClient(cluster.resolveCell);
  const postResolver = createColonnadePostResolver(cluster);
  const percolator = bootstrapKhoraPercolator({
    persistence: createPercolatorSqlitePersistence(hostDb),
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
  });
  let memories: ReturnType<typeof bootstrapKhoraMemories> | undefined;
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
    cellsDir: opts.cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal: registration.lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: encryption.sqlCipherKey,
  });
  const auth = createKhoraDidAuth({ nonceStore: createSqliteNonceStore(hostDb) });
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
  if (opts.memories !== undefined) {
    ensureCustomSqliteForExtensions();
    memoriesSqliteDb = openMemoriesDatabase(opts.memories.dbPath, {
      sqlCipherKey: encryption.sqlCipherKey,
    });
    const memoriesPersistence = createMemoriesPersistenceAsync(memoriesSqliteDb);
    ensurePendingEmbeddingsTable(memoriesSqliteDb);

    memories = bootstrapKhoraMemories({
      persistence: memoriesPersistence,
      close: () => memoriesSqliteDb?.close(),
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
      persistence: memoriesPersistence,
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
    ...(memories !== undefined ? { memories } : {}),
    percolator,
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
  });
  return { ctx, ...(memoriesSqliteDb !== undefined ? { memoriesSqliteDb } : {}) };
}
