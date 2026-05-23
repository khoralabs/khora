import { createAgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import { createAtriumDidAuth, createSqliteNonceStore } from "@khoralabs/atrium-auth";
import {
  type AtriumHostContext,
  bootstrapAtriumMemories,
  createAtriumCatalogApi,
  createAtriumHost,
  createColonnadePostResolver,
} from "@khoralabs/atrium-host";
import {
  createAtriumInvitesSqliteRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "@khoralabs/atrium-invites";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/atrium-transport";
import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
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
import type { AtriumEncryptionContext } from "./encryption-context.ts";
import type { AtriumMemoriesBootstrapConfig } from "./memories-env.ts";
import { createAtriumAdminStatsPort } from "./ops/admin-stats-port.ts";
import { createAtriumHostHealthPort } from "./ops/health-port.ts";

export type BootstrapAtriumHostOpts = {
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  cellPoolCount: number;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: AtriumMemoriesBootstrapConfig;
  encryption: AtriumEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
};

export async function bootstrapAtriumHost(
  opts: BootstrapAtriumHostOpts,
): Promise<AtriumHostContext> {
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
    subscriptionEdgeStore,
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
  const principalLifecycle = createRelayPrincipalLifecycle({
    catalogDb,
    framesDb,
    projectionStore,
    subscriptionEdgeStore,
    principalChannelStore,
    persistence,
    tenantKey,
    cluster,
  });
  const catalog = createAtriumCatalogApi({
    persistence,
    projectionStore,
    catalogDb,
    tenantKey,
    principalLifecycle,
  });
  const health = createAtriumHostHealthPort(catalogDb, framesDb);
  const adminStats = createAtriumAdminStatsPort({
    catalogDb,
    framesDb,
    cellsDir: opts.cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal: catalog.lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: encryption.sqlCipherKey,
  });
  const auth = createAtriumDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });

  const seedTokens = parseInviteSeedTokens(process.env.ATRIUM_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepoValue: ReturnType<typeof createAtriumInvitesSqliteRepo> | undefined;
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createAtriumInvitesSqliteRepo(catalogDb, pepper);
    repo.insertSeedInviteTokens(seedTokens);
    const rootPlain = repo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      console.error("[atrium-host] new root invite plaintext — store securely:", rootPlain);
    }
    invitesRepoValue = repo;
  }

  let memories: ReturnType<typeof bootstrapAtriumMemories> | undefined;
  if (opts.memories !== undefined) {
    ensureCustomSqliteForExtensions();
    const memoriesDb = openMemoriesDatabase(opts.memories.dbPath, {
      sqlCipherKey: encryption.sqlCipherKey,
    });
    const memoriesPersistence = createMemoriesPersistence(memoriesDb);
    memories = bootstrapAtriumMemories({
      persistence: memoriesPersistence,
      close: () => memoriesDb.close(),
      persistenceClient: createAgentRelayPersistenceClient(persistence),
      postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
    });
  }

  return createAtriumHost({
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
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
    ...(opts.roomLifecycle !== undefined ? { roomLifecycle: opts.roomLifecycle } : {}),
  });
}
