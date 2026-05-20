import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { HostRouteDeps } from "./deps.ts";
import { envCellsDir } from "../env.ts";
import { authorizeInternal } from "./internal-auth.ts";
import { jsonError } from "./responses.ts";

const REG_BY_PRINCIPAL = "relay:reg:by-principal";

function cellDbFilenameStem(cellId: string): string {
  return cellId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function tableExists(db: Database, name: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as
    | { name: string }
    | undefined;
  return row !== undefined;
}

function countOutboxForPrincipal(
  cellsDir: string,
  cellId: string,
  tenantKey: string,
  principalId: string,
): number {
  const path = join(cellsDir, `${cellDbFilenameStem(cellId)}.sqlite`);
  if (!existsSync(path)) return 0;
  const db = new Database(path, { readonly: true });
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

  const { catalogDb, tenantKey } = deps.ctx;
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
  });
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
