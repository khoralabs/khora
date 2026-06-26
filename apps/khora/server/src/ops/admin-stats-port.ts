import type { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";
import type {
  KhoraAdminCellDetailResult,
  KhoraAdminInactiveMember,
  KhoraAdminInactiveMembersResult,
  KhoraAdminNetworkActivityStats,
  KhoraAdminPrincipalDetailResult,
  KhoraAdminStatsPort,
  KhoraAdminStatsSummary,
  KhoraColonnadeCluster,
} from "@khoralabs/khora-host";
import { countRegisteredPrincipals, NAMESPACE_REG_BY_PRINCIPAL } from "@khoralabs/khora-host";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";

const REG_BY_PRINCIPAL = NAMESPACE_REG_BY_PRINCIPAL;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * MS_PER_DAY;
const HEARTBEAT_24H_MS = MS_PER_DAY;

type PrincipalActivity = {
  lastPostAtMs: number | null;
  lastStatusAtMs: number | null;
};

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
  cluster: KhoraColonnadeCluster,
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

function mergePrincipalActivity(
  target: Map<string, PrincipalActivity>,
  principalId: string,
  lastPostAtMs: number | null,
  lastStatusAtMs: number | null,
): void {
  const existing = target.get(principalId);
  if (existing === undefined) {
    target.set(principalId, { lastPostAtMs, lastStatusAtMs });
    return;
  }
  target.set(principalId, {
    lastPostAtMs:
      lastPostAtMs === null
        ? existing.lastPostAtMs
        : existing.lastPostAtMs === null
          ? lastPostAtMs
          : Math.max(existing.lastPostAtMs, lastPostAtMs),
    lastStatusAtMs:
      lastStatusAtMs === null
        ? existing.lastStatusAtMs
        : existing.lastStatusAtMs === null
          ? lastStatusAtMs
          : Math.max(existing.lastStatusAtMs, lastStatusAtMs),
  });
}

function scanOutboxActivity(
  cellsDir: string,
  tenantKey: string,
  sqlCipherKey: string,
  cellPoolCount: number,
): Map<string, PrincipalActivity> {
  const activity = new Map<string, PrincipalActivity>();
  for (let i = 0; i < cellPoolCount; i++) {
    const cellId = poolShardCellId(i);
    const db = openCellDbReadonly(cellsDir, cellId, sqlCipherKey);
    if (db === undefined) continue;
    try {
      if (!tableExists(db, "outbox")) continue;
      const rows = db
        .prepare(
          `SELECT principal_id AS principalId,
                  MAX(committed_at_ms) AS lastPostAtMs,
                  MAX(CASE WHEN json_extract(metadata, '$.postKind') = 'status'
                           THEN committed_at_ms END) AS lastStatusAtMs
           FROM outbox WHERE tenant_key = ?
           GROUP BY principal_id`,
        )
        .all(tenantKey) as Array<{
        principalId: string;
        lastPostAtMs: number | null;
        lastStatusAtMs: number | null;
      }>;
      for (const row of rows) {
        mergePrincipalActivity(activity, row.principalId, row.lastPostAtMs, row.lastStatusAtMs);
      }
    } finally {
      db.close();
    }
  }
  return activity;
}

function countSubscriptionsSince(
  cellsDir: string,
  tenantKey: string,
  sqlCipherKey: string,
  cellPoolCount: number,
  sinceMs: number,
): number {
  let total = 0;
  for (let i = 0; i < cellPoolCount; i++) {
    const cellId = poolShardCellId(i);
    const db = openCellDbReadonly(cellsDir, cellId, sqlCipherKey);
    if (db === undefined) continue;
    try {
      if (!tableExists(db, "outbox")) continue;
      total += (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM outbox
             WHERE tenant_key = ?
               AND json_extract(metadata, '$.postKind') = 'subscription'
               AND committed_at_ms >= ?`,
          )
          .get(tenantKey, sinceMs) as { c: number }
      ).c;
    } finally {
      db.close();
    }
  }
  return total;
}

function buildNetworkActivity(
  registeredAgents: number,
  principalIds: readonly string[],
  activity: Map<string, PrincipalActivity>,
  subscriptionsThisWeek: number,
  nowMs: number,
): KhoraAdminNetworkActivityStats {
  const threshold24h = nowMs - HEARTBEAT_24H_MS;
  const threshold7d = nowMs - WEEK_MS;
  let withStatusPost = 0;
  let activeLast24h = 0;
  let activeLast7d = 0;
  let silent7dPlus = 0;

  for (const did of principalIds) {
    const a = activity.get(did);
    const lastStatus = a?.lastStatusAtMs ?? null;
    if (lastStatus !== null) {
      withStatusPost++;
      if (lastStatus >= threshold24h) activeLast24h++;
      if (lastStatus >= threshold7d) activeLast7d++;
    }
    if (lastStatus === null || lastStatus < threshold7d) {
      silent7dPlus++;
    }
  }

  return {
    subscriptionsThisWeek,
    heartbeat: {
      registeredAgents,
      withStatusPost,
      activeLast24h,
      activeLast7d,
      silent7dPlus,
    },
  };
}

function buildInactiveMembers(
  principalIds: readonly string[],
  activity: Map<string, PrincipalActivity>,
  lookupNormalizedUsernameForPrincipal: (principalId: string) => string | undefined,
  inactiveDays: number,
  asOfMs: number,
): KhoraAdminInactiveMembersResult {
  const thresholdMs = asOfMs - inactiveDays * MS_PER_DAY;
  const members: KhoraAdminInactiveMember[] = [];

  for (const did of principalIds) {
    const a = activity.get(did);
    const lastPostAtMs = a?.lastPostAtMs ?? null;
    const lastStatusAtMs = a?.lastStatusAtMs ?? null;
    const reasons: KhoraAdminInactiveMember["reasons"] = [];
    if (lastPostAtMs === null || lastPostAtMs < thresholdMs) {
      reasons.push("no_post_7d");
    }
    if (lastStatusAtMs === null || lastStatusAtMs < thresholdMs) {
      reasons.push("silent_heartbeat_7d");
    }
    if (reasons.length === 0) continue;
    members.push({
      did,
      username: lookupNormalizedUsernameForPrincipal(did) ?? null,
      lastPostAtMs,
      lastStatusAtMs,
      reasons,
    });
  }

  members.sort((a, b) => {
    const aMs = Math.min(a.lastPostAtMs ?? 0, a.lastStatusAtMs ?? 0);
    const bMs = Math.min(b.lastPostAtMs ?? 0, b.lastStatusAtMs ?? 0);
    return aMs - bMs;
  });

  return { inactiveDays, asOfMs, members };
}

function clampInactiveDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return 7;
  return Math.min(90, Math.max(1, Math.floor(days)));
}

export function createKhoraAdminStatsPort(deps: {
  catalogDb: Database;
  cellsDir: string;
  tenantKey: string;
  cellPoolCount: number;
  cluster: KhoraColonnadeCluster;
  lookupNormalizedUsernameForPrincipal: (principalId: string) => string | undefined;
  sqlCipherKey: string;
}): KhoraAdminStatsPort {
  const {
    catalogDb,
    cellsDir,
    tenantKey,
    cellPoolCount,
    cluster,
    lookupNormalizedUsernameForPrincipal,
    sqlCipherKey,
  } = deps;

  function inviteStats(): KhoraAdminStatsSummary["invites"] {
    if (!tableExists(catalogDb, "khora_invite_tokens")) {
      return { configured: false, total: 0, consumed: 0, unconsumed: 0 };
    }
    const total = (
      catalogDb.prepare(`SELECT COUNT(*) AS c FROM khora_invite_tokens`).get() as { c: number }
    ).c;
    const consumed = (
      catalogDb
        .prepare(`SELECT COUNT(*) AS c FROM khora_invite_tokens WHERE consumed_at_ms IS NOT NULL`)
        .get() as { c: number }
    ).c;
    return { configured: true, total, consumed, unconsumed: total - consumed };
  }

  function teardownQueueStats(): KhoraAdminStatsSummary["teardown"] {
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
    return countRegisteredPrincipals(catalogDb, tenantKey);
  }

  function catalogStats(registeredUsers: number): KhoraAdminStatsSummary["catalog"] {
    const projectionRows = (
      catalogDb
        .prepare(`SELECT COUNT(*) AS c FROM relay_catalog_projections WHERE tenant_key = ?`)
        .get(tenantKey) as { c: number }
    ).c;
    const standingQueries = tableExists(catalogDb, "standing_queries")
      ? (
          catalogDb
            .prepare(`SELECT COUNT(*) AS c FROM standing_queries WHERE active = 1`)
            .get() as { c: number }
        ).c
      : 0;
    return { projectionRows, standingQueries, registeredUsers };
  }

  function buildCellShardsSummary(): KhoraAdminStatsSummary["cells"] {
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
    registeredPrincipalCount(): number {
      return registeredUsersCount();
    },

    summary(): KhoraAdminStatsSummary {
      const registeredUsers = registeredUsersCount();
      const principalIds = listRegisteredPrincipalIds(catalogDb, tenantKey);
      const nowMs = Date.now();
      const weekStart = nowMs - WEEK_MS;
      const activity = scanOutboxActivity(cellsDir, tenantKey, sqlCipherKey, cellPoolCount);
      return {
        registeredUsers,
        invites: inviteStats(),
        teardown: teardownQueueStats(),
        catalog: catalogStats(registeredUsers),
        cells: buildCellShardsSummary(),
        networkActivity: buildNetworkActivity(
          registeredUsers,
          principalIds,
          activity,
          countSubscriptionsSince(cellsDir, tenantKey, sqlCipherKey, cellPoolCount, weekStart),
          nowMs,
        ),
      };
    },

    cellDetail(cellId: string): KhoraAdminCellDetailResult {
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

    principalDetail(did: string): KhoraAdminPrincipalDetailResult {
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
      const subscriptionCount = tableExists(catalogDb, "standing_queries")
        ? (
            catalogDb
              .prepare(
                `SELECT COUNT(*) AS c FROM standing_queries
                 WHERE owner_id = ? AND active = 1`,
              )
              .get(did) as { c: number }
          ).c
        : 0;
      const accountStatus = tableExists(catalogDb, "agent_account_status")
        ? (
            catalogDb.prepare(`SELECT status FROM agent_account_status WHERE did = ?`).get(did) as
              | { status: "suspended" | "deleted" }
              | undefined
          )?.status
        : undefined;
      return {
        did,
        username: username ?? null,
        outboxCount,
        subscriptionCount,
        cellId,
        ...(accountStatus !== undefined ? { accountStatus } : {}),
      };
    },

    inactiveMembers(opts?: { inactiveDays?: number }): KhoraAdminInactiveMembersResult {
      const inactiveDays = clampInactiveDays(opts?.inactiveDays);
      const asOfMs = Date.now();
      const principalIds = listRegisteredPrincipalIds(catalogDb, tenantKey);
      const activity = scanOutboxActivity(cellsDir, tenantKey, sqlCipherKey, cellPoolCount);
      return buildInactiveMembers(
        principalIds,
        activity,
        lookupNormalizedUsernameForPrincipal,
        inactiveDays,
        asOfMs,
      );
    },
  };
}
