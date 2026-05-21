import { Database } from "bun:sqlite";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { HostRouteDeps } from "./deps.ts";
import { envCellsDir } from "../env.ts";
import { authorizeInternal } from "./internal-auth.ts";
import { jsonError } from "./responses.ts";

const REG_BY_PRINCIPAL = "relay:reg:by-principal";

function cellDbFilenameStem(cellId: string): string {
  return cellId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function cellDbPath(cellsDir: string, cellId: string): string {
  return join(cellsDir, `${cellDbFilenameStem(cellId)}.sqlite`);
}

function tableExists(db: Database, name: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as
    | { name: string }
    | null;
  return row !== null;
}

function openCellDbReadonly(cellsDir: string, cellId: string): Database | undefined {
  const path = cellDbPath(cellsDir, cellId);
  if (!existsSync(path)) return undefined;
  return new Database(path, { readonly: true });
}

function countOutboxForPrincipal(
  cellsDir: string,
  cellId: string,
  tenantKey: string,
  principalId: string,
): number {
  const db = openCellDbReadonly(cellsDir, cellId);
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

type CellTableCounts = {
  outboxCount: number;
  inboxCount: number;
};

function cellTableCounts(
  cellsDir: string,
  cellId: string,
  tenantKey: string,
): CellTableCounts & { provisioned: boolean } {
  const db = openCellDbReadonly(cellsDir, cellId);
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
  deps: HostRouteDeps,
  principalIds: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const principalId of principalIds) {
    const cellId = deps.ctx.cluster.assignPrincipalToCell(principalId);
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

function inviteStats(catalogDb: Database): {
  configured: boolean;
  total: number;
  consumed: number;
  unconsumed: number;
} {
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

function teardownQueueStats(catalogDb: Database): {
  pending: number;
  running: number;
  active: number;
  completed: number;
  failed: number;
} {
  if (!tableExists(catalogDb, "principal_teardown_jobs")) {
    return { pending: 0, running: 0, active: 0, completed: 0, failed: 0 };
  }
  const rows = catalogDb
    .prepare(
      `SELECT state, COUNT(*) AS c FROM principal_teardown_jobs GROUP BY state`,
    )
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

function catalogStats(catalogDb: Database, tenantKey: string, registeredUsers: number): {
  projectionRows: number;
  subscriptionEdges: number;
  registeredUsers: number;
} {
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

function framesStats(framesDb: Database): { activeRooms: number; totalFrames: number } {
  if (!tableExists(framesDb, "rooms")) {
    return { activeRooms: 0, totalFrames: 0 };
  }
  const nowMs = Date.now();
  const activeRooms = (
    framesDb
      .prepare(`SELECT COUNT(*) AS c FROM rooms WHERE expires_at_ms > ?`)
      .get(nowMs) as { c: number }
  ).c;
  const totalFrames = tableExists(framesDb, "room_frames")
    ? (framesDb.prepare(`SELECT COUNT(*) AS c FROM room_frames`).get() as { c: number }).c
    : 0;
  return { activeRooms, totalFrames };
}

function buildCellShardsSummary(deps: HostRouteDeps): {
  poolCount: number;
  inUseCount: number;
  shards: Array<{
    cellId: string;
    provisioned: boolean;
    outboxCount: number;
    inboxCount: number;
    homePrincipals: number;
  }>;
} {
  const poolCount = deps.ctx.cellPoolCount;
  const cellsDir = envCellsDir();
  const tenantKey = deps.ctx.tenantKey;
  const homeCounts = homePrincipalCountsByCell(deps, listRegisteredPrincipalIds(deps.ctx.catalogDb, tenantKey));

  const shards = Array.from({ length: poolCount }, (_, i) => {
    const cellId = poolShardCellId(i);
    const counts = cellTableCounts(cellsDir, cellId, tenantKey);
    return {
      cellId,
      ...counts,
      homePrincipals: homeCounts.get(cellId) ?? 0,
    };
  });

  const inUseCount = shards.filter((s) => s.provisioned && (s.outboxCount > 0 || s.inboxCount > 0)).length;
  return { poolCount, inUseCount, shards };
}

function cellDetailStats(deps: HostRouteDeps, cellId: string): {
  cellId: string;
  provisioned: boolean;
  fileSizeBytes: number | null;
  outboxCount: number;
  inboxCount: number;
  outboxPrincipals: number;
  inboxRecipients: number;
  homePrincipals: number;
  topOutboxAuthors: Array<{ principalId: string; count: number }>;
} {
  const cellsDir = envCellsDir();
  const tenantKey = deps.ctx.tenantKey;
  const path = cellDbPath(cellsDir, cellId);
  const provisioned = existsSync(path);
  const fileSizeBytes = provisioned ? statSync(path).size : null;

  const homeCounts = homePrincipalCountsByCell(deps, listRegisteredPrincipalIds(deps.ctx.catalogDb, tenantKey));
  const homePrincipals = homeCounts.get(cellId) ?? 0;

  const db = openCellDbReadonly(cellsDir, cellId);
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
        db.prepare(`SELECT COUNT(*) AS c FROM outbox WHERE tenant_key = ?`).get(tenantKey) as { c: number }
      ).c;
      outboxPrincipals = (
        db
          .prepare(
            `SELECT COUNT(DISTINCT principal_id) AS c FROM outbox WHERE tenant_key = ?`,
          )
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
        db.prepare(`SELECT COUNT(*) AS c FROM inbox WHERE tenant_key = ?`).get(tenantKey) as { c: number }
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
}

function requireInternalAuth(req: Request): Response | undefined {
  if (!authorizeInternal(req)) {
    return jsonError("Unauthorized", 401);
  }
  return undefined;
}

export function handleInternalAdminStatsSummary(
  req: Request,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;

  const { catalogDb, framesDb, tenantKey } = deps.ctx;
  const registeredUsers = (
    catalogDb
      .prepare(
        `SELECT COUNT(*) AS c FROM relay_catalog_projections
         WHERE tenant_key = ? AND namespace = ?`,
      )
      .get(tenantKey, REG_BY_PRINCIPAL) as { c: number }
  ).c;

  return Response.json({
    registeredUsers,
    invites: inviteStats(catalogDb),
    teardown: teardownQueueStats(catalogDb),
    catalog: catalogStats(catalogDb, tenantKey, registeredUsers),
    frames: framesStats(framesDb),
    cells: buildCellShardsSummary(deps),
  });
}

export function handleInternalAdminStatsCell(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;

  const cellId = url.searchParams.get("cellId")?.trim() ?? "";
  if (cellId.length === 0) {
    return jsonError("Missing cellId query parameter", 400);
  }

  const poolCount = deps.ctx.cellPoolCount;
  if (!isValidPoolCellId(cellId, poolCount)) {
    return jsonError("Invalid cellId", 400);
  }

  return Response.json(cellDetailStats(deps, cellId));
}

export function handleInternalAdminStatsPrincipal(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;

  const did = url.searchParams.get("did")?.trim() ?? "";
  if (did.length === 0) {
    return jsonError("Missing did query parameter", 400);
  }

  const { ctx } = deps;
  const { catalogDb, tenantKey, cluster } = ctx;

  const reg = catalogDb
    .prepare(
      `SELECT projection FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
    )
    .get(tenantKey, REG_BY_PRINCIPAL, did) as { projection: string } | undefined;

  if (reg === undefined) {
    return jsonError("Principal not registered", 404);
  }

  const username = ctx.lookupNormalizedUsernameForPrincipal(did);
  const cellId = cluster.assignPrincipalToCell(did);
  const outboxCount = countOutboxForPrincipal(envCellsDir(), cellId, tenantKey, did);

  const subscriptionCount = (
    catalogDb
      .prepare(
        `SELECT COUNT(*) AS c FROM relay_subscription_edges
         WHERE tenant_key = ? AND principal_id = ?`,
      )
      .get(tenantKey, did) as { c: number }
  ).c;

  return Response.json({
    did,
    username: username ?? null,
    outboxCount,
    subscriptionCount,
    cellId,
  });
}
