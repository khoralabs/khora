import { EnvKeyProvider, outboxKeyBytesToHex } from "@khoralabs/colonnade-crypto";
import { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence-sqlite";
import { createHostPersistenceClient } from "@khoralabs/host-runtime";
import { createKhoraDidAuth, createSqliteNonceStore } from "@khoralabs/khora-auth";
import {
  bootstrapKhoraMemories,
  bootstrapKhoraPercolator,
  createColonnadePostResolver,
  createKhoraCatalogApi,
  createKhoraHost,
  createPrincipalLifecycle,
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  type KhoraHostContext,
  startEmbeddingRetryWorker,
} from "@khoralabs/khora-host";
import {
  createKhoraInvitesSqliteRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "@khoralabs/khora-invites";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { createPercolatorSqlitePersistence } from "@khoralabs/percolator-sqlite";
import type { KhoraEncryptionContext } from "./encryption-context";
import { logger } from "./logger";
import type { KhoraMemoriesBootstrapConfig } from "./memories-env";
import { createKhoraAdminStatsPort } from "./ops/admin-stats-port";
import { createKhoraHostHealthPort } from "./ops/health-port";
import { createKhoraHostSpecPort } from "./ops/host-spec-port";
import { openKhoraHostPersistence } from "./persistence/khora-persistence";

export type BootstrapKhoraHostOpts = {
  catalogPath: string;
  cellsDir: string;
  cellPoolCount: number;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: KhoraMemoriesBootstrapConfig;
  encryption: KhoraEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
};

export async function bootstrapKhoraHost(opts: BootstrapKhoraHostOpts): Promise<KhoraHostContext> {
  const cellPoolCount = opts.cellPoolCount;
  const useCellWorkers = opts.useCellWorkers;
  const encryption = opts.encryption;
  const encryptionProvider = new EnvKeyProvider();
  const outboxKey = await encryptionProvider.getOutboxFieldKey();
  const { persistence, catalogDb } = await openKhoraHostPersistence({
    catalogPath: opts.catalogPath,
    encryptionProvider,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
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
    persistence: createPercolatorSqlitePersistence(catalogDb),
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
  });
  const principalLifecycle = createPrincipalLifecycle({
    persistence,
    purgePrincipalCells: async (principalId) => {
      const cellId = cluster.assignPrincipalToCell(principalId);
      await cluster.resolveCell(cellId).purgePrincipal(principalId);
    },
    onPrincipalTeardown(principalId) {
      for (const query of percolator.percolator.listQueriesByOwner(principalId)) {
        percolator.percolator.deactivateQuery(query.id);
      }
    },
    onPhase1Teardown(principalId) {
      invitesRepoValue?.deleteTokensForPrincipal(principalId);
    },
  });
  const catalog = createKhoraCatalogApi({ persistence, principalLifecycle });
  const health = createKhoraHostHealthPort(catalogDb);
  const hostSpec = createKhoraHostSpecPort({ catalogDb, tenantKey });
  const adminStats = createKhoraAdminStatsPort({
    catalogDb,
    cellsDir: opts.cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal: catalog.lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: encryption.sqlCipherKey,
  });
  const auth = createKhoraDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });
  const persistenceClient = createHostPersistenceClient(persistence);

  const seedTokens = parseInviteSeedTokens(process.env.KHORA_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepoValue: ReturnType<typeof createKhoraInvitesSqliteRepo> | undefined;
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createKhoraInvitesSqliteRepo(catalogDb, pepper);
    repo.insertSeedInviteTokens(seedTokens);
    const rootPlain = repo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      logger.error({ rootPlain }, "new root invite plaintext — store securely");
    }
    invitesRepoValue = repo;
  }

  let memories: ReturnType<typeof bootstrapKhoraMemories> | undefined;
  if (opts.memories !== undefined) {
    ensureCustomSqliteForExtensions();
    const memoriesDb = openMemoriesDatabase(opts.memories.dbPath, {
      sqlCipherKey: encryption.sqlCipherKey,
    });
    const memoriesPersistence = createMemoriesPersistence(memoriesDb);
    ensurePendingEmbeddingsTable(memoriesDb);
    memories = bootstrapKhoraMemories({
      persistence: memoriesPersistence,
      close: () => memoriesDb.close(),
      persistenceClient,
      postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
      onEmbeddingFailure: ({ namespace, memoryKey, text }) => {
        enqueuePendingEmbedding(memoriesDb, { namespace, memoryKey, text });
      },
    });
    startEmbeddingRetryWorker({
      db: memoriesDb,
      persistence: memoriesPersistence,
      embeddingModel: opts.memories.embeddingModel,
    });
  }

  return createKhoraHost({
    persistence,
    tenantKey,
    cluster,
    publicationClient,
    cellPoolCount,
    auth,
    principalLifecycle,
    catalog,
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
}
