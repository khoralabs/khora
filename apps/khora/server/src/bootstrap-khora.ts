import { createAgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import { createKhoraDidAuth, createSqliteNonceStore } from "@khoralabs/khora-auth";
import {
  bootstrapKhoraMemories,
  bootstrapKhoraPercolator,
  createColonnadePostResolver,
  createKhoraCatalogApi,
  createKhoraHost,
  type KhoraHostContext,
} from "@khoralabs/khora-host";
import {
  createKhoraInvitesSqliteRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "@khoralabs/khora-invites";
import type { KhoraRoomLifecycleHostEvent } from "@khoralabs/khora-transport";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import {
  createRelayColonnadeSocial,
  createRelayPrincipalLifecycle,
} from "@khoralabs/relay-colonnade";
import { EnvKeyProvider, outboxKeyBytesToHex } from "@khoralabs/sqlite-crypto";
import type { KhoraEncryptionContext } from "./encryption-context";
import type { KhoraMemoriesBootstrapConfig } from "./memories-env";
import { createKhoraAdminStatsPort } from "./ops/admin-stats-port";
import { createKhoraHostHealthPort } from "./ops/health-port";

export type BootstrapKhoraHostOpts = {
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  cellPoolCount: number;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: KhoraMemoriesBootstrapConfig;
  encryption: KhoraEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
  roomLifecycle?: (event: KhoraRoomLifecycleHostEvent) => void;
};

export async function bootstrapKhoraHost(opts: BootstrapKhoraHostOpts): Promise<KhoraHostContext> {
  const cellPoolCount = opts.cellPoolCount;
  const useCellWorkers = opts.useCellWorkers;
  const encryption = opts.encryption;
  const encryptionProvider = new EnvKeyProvider();
  const outboxKey = await encryptionProvider.getOutboxFieldKey();
  const {
    persistence,
    social,
    catalogDb,
    framesDb,
    projectionStore,
    principalChannelStore,
    tenantKey,
  } = await createRelayColonnadeSocial({
    catalogPath: opts.catalogPath,
    framesDbPath: opts.framesDbPath,
    encryptionProvider,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
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
    catalogDb,
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
  });
  const principalLifecycle = createRelayPrincipalLifecycle({
    catalogDb,
    framesDb,
    projectionStore,
    principalChannelStore,
    persistence,
    tenantKey,
    cluster,
    onPrincipalTeardown(principalId) {
      for (const query of percolator.percolator.listQueriesByOwner(principalId)) {
        percolator.percolator.deactivateQuery(query.id);
      }
    },
  });
  const catalog = createKhoraCatalogApi({
    persistence,
    projectionStore,
    catalogDb,
    tenantKey,
    principalLifecycle,
  });
  const health = createKhoraHostHealthPort(catalogDb, framesDb);
  const adminStats = createKhoraAdminStatsPort({
    catalogDb,
    framesDb,
    cellsDir: opts.cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal: catalog.lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: encryption.sqlCipherKey,
  });
  const auth = createKhoraDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });
  const persistenceClient = createAgentRelayPersistenceClient(persistence);

  const seedTokens = parseInviteSeedTokens(process.env.KHORA_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepoValue: ReturnType<typeof createKhoraInvitesSqliteRepo> | undefined;
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createKhoraInvitesSqliteRepo(catalogDb, pepper);
    repo.insertSeedInviteTokens(seedTokens);
    const rootPlain = repo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      console.error("[khora-host] new root invite plaintext — store securely:", rootPlain);
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
    memories = bootstrapKhoraMemories({
      persistence: memoriesPersistence,
      close: () => memoriesDb.close(),
      persistenceClient,
      postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
    });
  }

  return createKhoraHost({
    persistence,
    social,
    tenantKey,
    cluster,
    publicationClient,
    cellPoolCount,
    auth,
    principalLifecycle,
    catalog,
    health,
    adminStats,
    outboxPayloadCodec: encryption.outboxPayloadCodec,
    ...(invitesRepoValue !== undefined ? { invitesRepo: invitesRepoValue } : {}),
    ...(memories !== undefined ? { memories } : {}),
    percolator,
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
    ...(opts.roomLifecycle !== undefined ? { roomLifecycle: opts.roomLifecycle } : {}),
  });
}
