import { createTestEncryptionMaterial } from "@khoralabs/colonnade-crypto";
import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import { createKhoraDidAuth, createSqliteNonceStore } from "@khoralabs/khora-auth";
import type { KhoraHostSpec } from "@khoralabs/khora-contracts";
import {
  bootstrapKhoraPercolator,
  createKhoraCatalogApi,
  createKhoraHost,
  createPrincipalLifecycle,
  type KhoraAdminStatsPort,
  type KhoraHostContext,
  type KhoraHostHealthPort,
  type KhoraHostSpecPort,
} from "@khoralabs/khora-host";
import { openKhoraHostPersistence } from "../persistence/khora-persistence";

export type CreateTestKhoraHostOpts = {
  catalogPath: string;
  cellsDir: string;
  cellPoolCount?: number;
  useCellWorkers?: boolean;
  tenantKey?: string;
  startPrincipalTeardownWorker?: boolean;
  health?: KhoraHostHealthPort;
  adminStats?: KhoraAdminStatsPort;
  hostSpec?: KhoraHostSpecPort;
};

export async function createTestKhoraHost(
  opts: CreateTestKhoraHostOpts,
): Promise<KhoraHostContext> {
  const cellPoolCount = opts.cellPoolCount ?? 16;
  const useCellWorkers = opts.useCellWorkers ?? false;
  const encryption = createTestEncryptionMaterial();
  const { persistence, catalogDb } = await openKhoraHostPersistence({
    catalogPath: opts.catalogPath,
    encryptionProvider: encryption.provider,
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
      outboxKeyHex: encryption.outboxKeyHex,
    },
  });
  const publicationClient = new ColonnadePublicationClient(cluster.resolveCell);
  const percolator = bootstrapKhoraPercolator({ catalogDb });
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
  });
  const catalog = createKhoraCatalogApi({ persistence, principalLifecycle });
  const health = opts.health ?? {
    ping() {
      catalogDb.query("SELECT 1").run();
    },
  };
  const adminStats = opts.adminStats ?? {
    summary: () => ({
      registeredUsers: 0,
      invites: { configured: false, total: 0, consumed: 0, unconsumed: 0 },
      teardown: { pending: 0, running: 0, active: 0, completed: 0, failed: 0 },
      catalog: { projectionRows: 0, standingQueries: 0, registeredUsers: 0 },
      cells: { poolCount: cellPoolCount, inUseCount: 0, shards: [] },
      networkActivity: {
        subscriptionsThisWeek: 0,
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
    registeredPrincipalCount: () => 0,
  };
  const hostSpec: KhoraHostSpecPort = opts.hostSpec ?? {
    read: () => null,
    readEffective: () => ({
      registryUrl: "http://localhost:4000",
      slug: undefined,
      publicBaseUrl: "http://127.0.0.1:8788",
      displayName: undefined,
      populationLimit: undefined,
      registrationSecret: undefined,
      managementToken: undefined,
    }),
    patch: (patch) => {
      const next: KhoraHostSpec = { updatedAtMs: Date.now() };
      if (patch.registryUrl !== undefined) next.registryUrl = patch.registryUrl;
      if (patch.slug !== undefined) next.slug = patch.slug;
      if (patch.publicBaseUrl !== undefined) next.publicBaseUrl = patch.publicBaseUrl;
      if (patch.displayName !== undefined) next.displayName = patch.displayName;
      if (patch.populationLimit === null) {
        delete next.populationLimit;
      } else if (patch.populationLimit !== undefined) {
        next.populationLimit = patch.populationLimit;
      }
      return next;
    },
    storeSecrets: (secrets) => ({ ...secrets, updatedAtMs: Date.now() }),
    clearRegistrationSecret: () => ({ updatedAtMs: Date.now() }),
  };
  const auth = createKhoraDidAuth({ nonceStore: createSqliteNonceStore(catalogDb) });
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
    percolator,
    startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker ?? false,
  });
}
