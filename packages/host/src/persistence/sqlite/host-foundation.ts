import type { Database } from "bun:sqlite";
import { ColonnadePublicationClient } from "@khoralabs/colonnade";
import type { OutboxPayloadCodec } from "@khoralabs/colonnade/crypto";
import { openMaybeEncryptedDatabaseSync } from "@khoralabs/colonnade/crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade/sqlite";
import { AuthError, createSignedRequestAuth, type SignedRequestAuth } from "@khoralabs/khora-auth";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import {
  createPercolatorSqlitePersistence,
  ensurePercolatorSchema,
} from "@khoralabs/percolator/sqlite";
import {
  bootstrapHostSubscriptions,
  type HostSubscriptions,
} from "../../discovery/subscriptions/bootstrap";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
  PostResolver,
} from "../../ports";
import { createColonnadePostResolver } from "../../posts/resolve";
import { createKhoraRegistrationApi, type KhoraRegistrationApi } from "../../registration/api";
import { createPrincipalLifecycle, type PrincipalLifecycle } from "../../registration/lifecycle";
import {
  createHostPersistenceClient,
  type HostPersistenceClient,
  type KhoraHostPersistence,
} from "../core";
import { createKhoraAdminStatsPort } from "./admin-stats-port";
import { createKhoraHostHealthPort } from "./health-port";
import { createKhoraHostSpecPort } from "./host-spec-port";
import { openKhoraHostSqlitePersistence } from "./khora-persistence";
import { createSqliteNonceStore } from "./nonce-store";
import { applyKhoraSqlitePragmas } from "./sqlite-setup";

export type SqliteKhoraHostFoundationEncryption = {
  readonly sqlCipherKey?: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  readonly outboxKeyHex: string;
};

export type CreateSqliteKhoraHostFoundationOpts = {
  hostDbPath: string;
  authNoncesDbPath: string;
  percolatorDbPath: string;
  cellsDir: string;
  useCellWorkers: boolean;
  tenantKey?: string;
  encryption: SqliteKhoraHostFoundationEncryption;
  /** Optional embedding model for percolator standing queries. */
  embeddingModel?: EmbeddingModel;
  /**
   * Extra work after percolator query deactivation during phase-2 teardown
   * (e.g. memories indexer delete).
   */
  onPrincipalTeardown?: (principalId: PrincipalId, profileId: string) => void | Promise<void>;
  /**
   * Extra phase-1 side effects (e.g. invite token delete, memories invalidate).
   */
  onPhase1Teardown?: (principalId: PrincipalId, profileId: string) => void;
};

export type SqliteKhoraHostFoundation = {
  hostDb: Database;
  persistence: KhoraHostPersistence;
  persistenceClient: HostPersistenceClient;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  postResolver: PostResolver;
  subscriptions: HostSubscriptions;
  principalLifecycle: PrincipalLifecycle;
  registration: KhoraRegistrationApi;
  health: KhoraHostHealthPort;
  adminStats: KhoraAdminStatsPort;
  hostSpec: KhoraHostSpecPort;
  auth: SignedRequestAuth;
  outboxPayloadCodec: OutboxPayloadCodec;
};

function openSideDb(path: string, sqlCipherKey?: string): Database {
  const db = openMaybeEncryptedDatabaseSync(path, { create: true }, sqlCipherKey);
  applyKhoraSqlitePragmas(db);
  return db;
}

/**
 * Open host/auth/percolator SQLite, Colonnade cells, and wire registration/auth/ops ports.
 * App bootstrap adds invites, memories search, then {@link createKhoraHost}.
 */
export async function createSqliteKhoraHostFoundation(
  opts: CreateSqliteKhoraHostFoundationOpts,
): Promise<SqliteKhoraHostFoundation> {
  const encryption = opts.encryption;
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
    useCellWorkers: opts.useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
  });
  const cellPoolCount = cluster.cellPoolCount;
  const publicationClient = new ColonnadePublicationClient(
    cluster.resolveCell,
    cluster.inboxDelivery,
  );
  const postResolver = createColonnadePostResolver(cluster);
  const subscriptions = bootstrapHostSubscriptions({
    persistence: createPercolatorSqlitePersistence(percolatorDb),
    ...(opts.embeddingModel !== undefined ? { embeddingModel: opts.embeddingModel } : {}),
  });
  const principalLifecycle = createPrincipalLifecycle({
    persistence,
    purgePrincipalCells: async (principalId) => {
      const cellId = cluster.assignPrincipalToCell(principalId);
      await cluster.resolveCell(cellId).purgePrincipal(principalId);
    },
    async onPrincipalTeardown(principalId, profileId) {
      for (const query of await subscriptions.percolator.listQueriesByOwner(principalId)) {
        await subscriptions.percolator.deactivateQuery(query.id);
      }
      await opts.onPrincipalTeardown?.(principalId, profileId);
    },
    onPhase1Teardown(principalId, profileId) {
      opts.onPhase1Teardown?.(principalId, profileId);
    },
  });
  const registration = createKhoraRegistrationApi({ persistence, principalLifecycle });
  const health = createKhoraHostHealthPort(hostDb);
  const hostSpec = createKhoraHostSpecPort({ hostDb, tenantKey });
  const adminStats = createKhoraAdminStatsPort({ hostDb, tenantKey });
  const auth = createSignedRequestAuth({
    nonceStore: createSqliteNonceStore(authNoncesDb),
    assertPrincipalAllowed(did) {
      const status = persistence.agentAccountStatus.getStatus(did);
      if (status === "suspended") throw new AuthError("agent account suspended", 403);
      if (status === "deleted") throw new AuthError("agent account deleted", 403);
    },
  });
  const persistenceClient = createHostPersistenceClient(persistence);

  return {
    hostDb,
    persistence,
    persistenceClient,
    tenantKey,
    cluster,
    publicationClient,
    cellPoolCount,
    postResolver,
    subscriptions,
    principalLifecycle,
    registration,
    health,
    adminStats,
    hostSpec,
    auth,
    outboxPayloadCodec: encryption.outboxPayloadCodec,
  };
}
