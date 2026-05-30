import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import { createKhoraDidAuth, createSqliteNonceStore } from "@khoralabs/khora-auth";
import {
  createRelayColonnadeSocial,
  createRelayPrincipalLifecycle,
} from "@khoralabs/relay-colonnade";
import { createTestEncryptionMaterial } from "@khoralabs/sqlite-crypto";
import {
  bootstrapKhoraPercolator,
  createKhoraCatalogApi,
  createKhoraHost,
  type KhoraAdminStatsPort,
  type KhoraHostContext,
  type KhoraHostHealthPort,
} from "../index";

export type CreateTestKhoraHostOpts = {
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  cellPoolCount?: number;
  useCellWorkers?: boolean;
  tenantKey?: string;
  startPrincipalTeardownWorker?: boolean;
  health?: KhoraHostHealthPort;
  adminStats?: KhoraAdminStatsPort;
};

export async function createTestKhoraHost(
  opts: CreateTestKhoraHostOpts,
): Promise<KhoraHostContext> {
  const cellPoolCount = opts.cellPoolCount ?? 16;
  const useCellWorkers = opts.useCellWorkers ?? false;
  const encryption = createTestEncryptionMaterial();
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
  const percolator = bootstrapKhoraPercolator({ catalogDb });
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
      catalog: { projectionRows: 0, standingQueries: 0, registeredUsers: 0 },
      frames: { activeRooms: 0, totalFrames: 0 },
      cells: { poolCount: cellPoolCount, inUseCount: 0, shards: [] },
      networkActivity: {
        subscriptionsThisWeek: 0,
        roomsCreatedThisWeek: 0,
        totalRoomsCreated: 0,
        heartbeat: {
          registeredAgents: 0,
          withStatusPost: 0,
          activeLast24h: 0,
          activeLast7d: 0,
          silent7dPlus: 0,
        },
      },
    }),
    cellDetail: () => ({ error: "invalid_cell" as const }),
    principalDetail: () => ({ error: "not_registered" as const }),
    inactiveMembers: () => ({ inactiveDays: 7, asOfMs: Date.now(), members: [] }),
  };
  const auth = createKhoraDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });

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
    percolator,
    startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker ?? false,
  });
}
