import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";
import type {
  AtriumAdminCellDetailResult,
  AtriumAdminPrincipalDetailResult,
  AtriumAdminStatsPort,
  AtriumAdminStatsSummary,
  AtriumColonnadeCluster,
} from "@khoralabs/atrium-host";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";

const REG_BY_PRINCIPAL = "relay:reg:by-principal";

function cellDbFilenameStem(cellId: string): string {
  return cellId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function cellDbPath(cellsDir: string, cellId: string): string {
  return join(cellsDir, `${cellDbFilenameStem(cellId)}.sqlite`);
}

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { name: string } | null;
  return row !== null;
}

function openCellDbReadonly(
  cellsDir: string,
  cellId: string,
  sqlCipherKey: string,
): Database | undefined {
  const path = cellDbPath(cellsDir, cellId);
  if (!existsSync(path)) return undefined;
  return openEncryptedDatabaseSync(path, { readonly: true }, sqlCipherKey);
}

function countOutboxForPrincipal(
  cellsDir: string,
  cellId: string,
  tenantKey: string,
  principalId: string,
  sqlCipherKey: string,
): number {
  const db = openCellDbReadonly(cellsDir, cellId, sqlCipherKey);
  if (db === undefined) return 0;
  try {
    if (!tableExists(db, "outbox")) return 0;
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM outbox WHERE tenant_key = ? AND principal_id = ?`)
      .get(tenantKey, principalId) as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

function cellTableCounts(
  cellsDir: string,
  cellId: string,
  tenantKey: string,
  sqlCipherKey: string,
): { provisioned: boolean; outboxCount: number; inboxCount: number } {
  const db = openCellDbReadonly(cellsDir, cellId, sqlCipherKey);
  if (db === undefined) {
    return { provisioned: false, outboxCount: 0, inboxCount: 0 };
  }
  try {
    let outboxCount = 0;
    let inboxCount = 0;
    if (tableExists(db, "outbox")) {
      outboxCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM outbox WHERE tenant_key = ?`).get(tenantKey) as {
          c: number;
        }
      ).c;
    }
    if (tableExists(db, "inbox")) {
      inboxCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM inbox WHERE tenant_key = ?`).get(tenantKey) as {
          c: number;
        }
      ).c;
    }
    return { provisioned: true, outboxCount, inboxCount };
  } finally {
    db.close();
  }
}

function listRegisteredPrincipalIds(catalogDb: Database, tenantKey: string): string[] {
  const rows = catalogDb
    .prepare(
      `SELECT entry_key FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ?`,
    )
    .all(tenantKey, REG_BY_PRINCIPAL) as { entry_key: string }[];
  return rows.map((r) => r.entry_key);
}

function homePrincipalCountsByCell(
  cluster: AtriumColonnadeCluster,
  principalIds: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const principalId of principalIds) {
    const cellId = cluster.assignPrincipalToCell(principalId);
    counts.set(cellId, (counts.get(cellId) ?? 0) + 1);
  }
  return counts;
}

function isValidPoolCellId(cellId: string, poolCount: number): boolean {
  const match = /^colonnade-shard-(\d+)$/.exec(cellId);
  if (match === null) return false;
  const index = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(index) && index >= 0 && index < poolCount;
}

export function createAtriumAdminStatsPort(deps: {
  catalogDb: Database;
  framesDb: Database;
  cellsDir: string;
  tenantKey: string;
  cellPoolCount: number;
  cluster: AtriumColonnadeCluster;
  lookupNormalizedUsernameForPrincipal: (principalId: string) => string | undefined;
  sqlCipherKey: string;
}): AtriumAdminStatsPort {
  const {
    catalogDb,
    framesDb,
    cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal,
    sqlCipherKey,
  } = deps;

  function inviteStats(): AtriumAdminStatsSummary["invites"] {
    if (!tableExists(catalogDb, "at2_invite_tokens")) {
      return { configured: false, total: 0, consumed: 0, unconsumed: 0 };
    }
    const total = (
      catalogDb.prepare(`SELECT COUNT(*) AS c FROM at2_invite_tokens`).get() as { c: number }
    ).c;
    const consumed = (
      catalogDb
        .prepare(`SELECT COUNT(*) AS c FROM at2_invite_tokens WHERE consumed_at_ms IS NOT NULL`)
        .get() as { c: number }
    ).c;
    return { configured: true, total, consumed, unconsumed: total - consumed };
  }

  function teardownQueueStats(): AtriumAdminStatsSummary["teardown"] {
    if (!tableExists(catalogDb, "principal_teardown_jobs")) {
      return { pending: 0, running: 0, active: 0, completed: 0, failed: 0 };
    }
    const rows = catalogDb
      .prepare(`SELECT state, COUNT(*) AS c FROM principal_teardown_jobs GROUP BY state`)
      .all() as { state: string; c: number }[];
    const byState = new Map(rows.map((r) => [r.state, r.c]));
    const pending = byState.get("pending") ?? 0;
    const running = byState.get("running") ?? 0;
    return {
      pending,
      running,
      active: pending + running,
      completed: byState.get("completed") ?? 0,
      failed: byState.get("failed") ?? 0,
    };
  }

  function registeredUsersCount(): number {
    return (
      catalogDb
        .prepare(
          `SELECT COUNT(*) AS c FROM relay_catalog_projections
           WHERE tenant_key = ? AND namespace = ?`,
        )
        .get(tenantKey, REG_BY_PRINCIPAL) as { c: number }
    ).c;
  }

  function catalogStats(registeredUsers: number): AtriumAdminStatsSummary["catalog"] {
    const projectionRows = (
      catalogDb
        .prepare(`SELECT COUNT(*) AS c FROM relay_catalog_projections WHERE tenant_key = ?`)
        .get(tenantKey) as { c: number }
    ).c;
    const subscriptionEdges = tableExists(catalogDb, "relay_subscription_edges")
      ? (
          catalogDb
            .prepare(`SELECT COUNT(*) AS c FROM relay_subscription_edges WHERE tenant_key = ?`)
            .get(tenantKey) as { c: number }
        ).c
      : 0;
    return { projectionRows, subscriptionEdges, registeredUsers };
  }

  function framesStats(): AtriumAdminStatsSummary["frames"] {
    if (!tableExists(framesDb, "rooms")) {
      return { activeRooms: 0, totalFrames: 0 };
    }
    const nowMs = Date.now();
    const activeRooms = (
      framesDb.prepare(`SELECT COUNT(*) AS c FROM rooms WHERE expires_at_ms > ?`).get(nowMs) as {
        c: number;
      }
    ).c;
    const totalFrames = tableExists(framesDb, "room_frames")
      ? (framesDb.prepare(`SELECT COUNT(*) AS c FROM room_frames`).get() as { c: number }).c
      : 0;
    return { activeRooms, totalFrames };
  }

  function buildCellShardsSummary(): AtriumAdminStatsSummary["cells"] {
    const homeCounts = homePrincipalCountsByCell(
      cluster,
      listRegisteredPrincipalIds(catalogDb, tenantKey),
    );
    const shards = Array.from({ length: cellPoolCount }, (_, i) => {
      const cellId = poolShardCellId(i);
      const counts = cellTableCounts(cellsDir, cellId, tenantKey, sqlCipherKey);
      return {
        cellId,
        ...counts,
        homePrincipals: homeCounts.get(cellId) ?? 0,
      };
    });
    const inUseCount = shards.filter(
      (s) => s.provisioned && (s.outboxCount > 0 || s.inboxCount > 0),
    ).length;
    return { poolCount: cellPoolCount, inUseCount, shards };
  }

  return {
    summary(): AtriumAdminStatsSummary {
      const registeredUsers = registeredUsersCount();
      return {
        registeredUsers,
        invites: inviteStats(),
        teardown: teardownQueueStats(),
        catalog: catalogStats(registeredUsers),
        frames: framesStats(),
        cells: buildCellShardsSummary(),
      };
    },

    cellDetail(cellId: string): AtriumAdminCellDetailResult {
      if (!isValidPoolCellId(cellId, cellPoolCount)) {
        return { error: "invalid_cell" };
      }
      const path = cellDbPath(cellsDir, cellId);
      const provisioned = existsSync(path);
      const fileSizeBytes = provisioned ? statSync(path).size : null;
      const homeCounts = homePrincipalCountsByCell(
        cluster,
        listRegisteredPrincipalIds(catalogDb, tenantKey),
      );
      const homePrincipals = homeCounts.get(cellId) ?? 0;
      const db = openCellDbReadonly(cellsDir, cellId, sqlCipherKey);
      if (db === undefined) {
        return {
          cellId,
          provisioned: false,
          fileSizeBytes: null,
          outboxCount: 0,
          inboxCount: 0,
          outboxPrincipals: 0,
          inboxRecipients: 0,
          homePrincipals,
          topOutboxAuthors: [],
        };
      }
      try {
        let outboxCount = 0;
        let inboxCount = 0;
        let outboxPrincipals = 0;
        let inboxRecipients = 0;
        let topOutboxAuthors: Array<{ principalId: string; count: number }> = [];
        if (tableExists(db, "outbox")) {
          outboxCount = (
            db.prepare(`SELECT COUNT(*) AS c FROM outbox WHERE tenant_key = ?`).get(tenantKey) as {
              c: number;
            }
          ).c;
          outboxPrincipals = (
            db
              .prepare(`SELECT COUNT(DISTINCT principal_id) AS c FROM outbox WHERE tenant_key = ?`)
              .get(tenantKey) as { c: number }
          ).c;
          topOutboxAuthors = db
            .prepare(
              `SELECT principal_id AS principalId, COUNT(*) AS count
               FROM outbox WHERE tenant_key = ?
               GROUP BY principal_id ORDER BY count DESC LIMIT 5`,
            )
            .all(tenantKey) as Array<{ principalId: string; count: number }>;
        }
        if (tableExists(db, "inbox")) {
          inboxCount = (
            db.prepare(`SELECT COUNT(*) AS c FROM inbox WHERE tenant_key = ?`).get(tenantKey) as {
              c: number;
            }
          ).c;
          inboxRecipients = (
            db
              .prepare(
                `SELECT COUNT(DISTINCT recipient_principal_id) AS c FROM inbox WHERE tenant_key = ?`,
              )
              .get(tenantKey) as { c: number }
          ).c;
        }
        return {
          cellId,
          provisioned: true,
          fileSizeBytes,
          outboxCount,
          inboxCount,
          outboxPrincipals,
          inboxRecipients,
          homePrincipals,
          topOutboxAuthors,
        };
      } finally {
        db.close();
      }
    },

    principalDetail(did: string): AtriumAdminPrincipalDetailResult {
      const reg = catalogDb
        .prepare(
          `SELECT projection FROM relay_catalog_projections
           WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
        )
        .get(tenantKey, REG_BY_PRINCIPAL, did) as { projection: string } | undefined;
      if (reg === undefined) {
        return { error: "not_registered" };
      }
      const username = lookupNormalizedUsernameForPrincipal(did);
      const cellId = cluster.assignPrincipalToCell(did);
      const outboxCount = countOutboxForPrincipal(cellsDir, cellId, tenantKey, did, sqlCipherKey);
      const subscriptionCount = (
        catalogDb
          .prepare(
            `SELECT COUNT(*) AS c FROM relay_subscription_edges
             WHERE tenant_key = ? AND principal_id = ?`,
          )
          .get(tenantKey, did) as { c: number }
      ).c;
      return {
        did,
        username: username ?? null,
        outboxCount,
        subscriptionCount,
        cellId,
      };
    },
  };
}
