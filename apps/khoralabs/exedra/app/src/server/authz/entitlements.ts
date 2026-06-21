import type { Database } from "bun:sqlite";

import { ACTIVE_ENTITLEMENT_SQL, isActive } from "./active";
import type { EntitlementRecord, ScopeRef } from "./types";

type EntitlementRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  feature: string;
  created_at_ms: number;
  expired_at_ms: number | null;
  revoked_at_ms: number | null;
};

function mapEntitlement(row: EntitlementRow): EntitlementRecord {
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    feature: row.feature,
    createdAtMs: row.created_at_ms,
    expiredAtMs: row.expired_at_ms,
    revokedAtMs: row.revoked_at_ms,
  };
}

function findEntitlementRow(db: Database, scope: ScopeRef, feature: string): EntitlementRow | null {
  return db
    .query<EntitlementRow, [string, string, string]>(
      `SELECT id, scope_type, scope_id, feature, created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_entitlements
       WHERE scope_type = ? AND scope_id = ? AND feature = ?
       ORDER BY revoked_at_ms IS NOT NULL ASC, created_at_ms DESC
       LIMIT 1`,
    )
    .get(scope.type, scope.id, feature);
}

export function entitle(
  db: Database,
  scope: ScopeRef,
  feature: string,
  expiresAtMs?: number | null,
): string {
  const nowMs = Date.now();
  const existing = findEntitlementRow(db, scope, feature);
  if (existing !== null) {
    if (existing.revoked_at_ms === null && isActive(existing, nowMs)) return existing.id;
    db.prepare(
      `UPDATE authz_entitlements
       SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
       WHERE id = ?`,
    ).run(expiresAtMs ?? null, nowMs, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO authz_entitlements (
         id, scope_type, scope_id, feature, created_at_ms, expired_at_ms, revoked_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(id, scope.type, scope.id, feature, nowMs, expiresAtMs ?? null);
    return id;
  } catch {
    const raced = findEntitlementRow(db, scope, feature);
    if (raced === null) throw new Error("entitle insert failed");
    if (raced.revoked_at_ms === null && isActive(raced, nowMs)) return raced.id;
    db.prepare(
      `UPDATE authz_entitlements
       SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
       WHERE id = ?`,
    ).run(expiresAtMs ?? null, nowMs, raced.id);
    return raced.id;
  }
}

export function revokeEntitlement(
  db: Database,
  scope: ScopeRef,
  feature: string,
  nowMs = Date.now(),
): void {
  db.prepare(
    `UPDATE authz_entitlements
     SET revoked_at_ms = ?
     WHERE scope_type = ? AND scope_id = ? AND feature = ?
       AND revoked_at_ms IS NULL`,
  ).run(nowMs, scope.type, scope.id, feature);
}

export function hasEntitlement(
  db: Database,
  scope: ScopeRef,
  feature: string,
  nowMs = Date.now(),
): boolean {
  const row = db
    .query<{ c: number }, [string, string, string, number]>(
      `SELECT COUNT(1) AS c FROM authz_entitlements
       WHERE scope_type = ? AND scope_id = ? AND feature = ?
         AND ${ACTIVE_ENTITLEMENT_SQL}`,
    )
    .get(scope.type, scope.id, feature, nowMs);
  return row !== null && row.c > 0;
}

export function listEntitlements(
  db: Database,
  scope: ScopeRef,
  nowMs = Date.now(),
): EntitlementRecord[] {
  const rows = db
    .query<EntitlementRow, [string, string, number]>(
      `SELECT id, scope_type, scope_id, feature, created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_entitlements
       WHERE scope_type = ? AND scope_id = ?
         AND ${ACTIVE_ENTITLEMENT_SQL}
       ORDER BY created_at_ms ASC`,
    )
    .all(scope.type, scope.id, nowMs);
  return rows.map(mapEntitlement);
}
