import { createAtriumDidAuth, createSqliteNonceStore } from "@khoralabs/atrium-auth";
import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import {
  createRelayColonnadeSocial,
  createRelayPrincipalLifecycle,
} from "@khoralabs/relay-colonnade";
import { createTestEncryptionMaterial } from "@khoralabs/sqlite-crypto";
import {
  type AtriumAdminStatsPort,
  type AtriumHostContext,
  type AtriumHostHealthPort,
  createAtriumCatalogApi,
  createAtriumHost,
} from "../index.ts";

export type CreateTestAtriumHostOpts = {
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  cellPoolCount?: number;
  useCellWorkers?: boolean;
  tenantKey?: string;
  startPrincipalTeardownWorker?: boolean;
  health?: AtriumHostHealthPort;
  adminStats?: AtriumAdminStatsPort;
};

export async function createTestAtriumHost(
  opts: CreateTestAtriumHostOpts,
): Promise<AtriumHostContext> {
  const cellPoolCount = opts.cellPoolCount ?? 16;
  const useCellWorkers = opts.useCellWorkers ?? false;
  const encryption = createTestEncryptionMaterial();
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
    encryptionProvider: encryption.provider,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: opts.cellsDir,
    mode: { kind: "pool", cellCount: cellPoolCount },
    useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
  });
  const publicationClient = new ColonnadePublicationClient(cluster.resolveCell);
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
  const health = opts.health ?? {
    ping() {
      catalogDb.query("SELECT 1").run();
      framesDb.query("SELECT 1").run();
    },
  };
  const adminStats = opts.adminStats ?? {
    summary: () => ({
      registeredUsers: 0,
      invites: { configured: false, total: 0, consumed: 0, unconsumed: 0 },
      teardown: { pending: 0, running: 0, active: 0, completed: 0, failed: 0 },
      catalog: { projectionRows: 0, subscriptionEdges: 0, registeredUsers: 0 },
      frames: { activeRooms: 0, totalFrames: 0 },
      cells: { poolCount: cellPoolCount, inUseCount: 0, shards: [] },
    }),
    cellDetail: () => ({ error: "invalid_cell" as const }),
    principalDetail: () => ({ error: "not_registered" as const }),
  };
  const auth = createAtriumDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });

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
    startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker ?? false,
  });
}
