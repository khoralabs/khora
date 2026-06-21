import type { Database } from "bun:sqlite";

import { ACTIVE_GRANT_SQL, isActive } from "./active";
import type { GrantRecord, ResourceRef, ScopeRef } from "./types";

type GrantRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  resource_type: string;
  resource_id: string;
  feature: string;
  created_at_ms: number;
  expired_at_ms: number | null;
  revoked_at_ms: number | null;
};

function mapGrant(row: GrantRow): GrantRecord {
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    feature: row.feature,
    createdAtMs: row.created_at_ms,
    expiredAtMs: row.expired_at_ms,
    revokedAtMs: row.revoked_at_ms,
  };
}

function findGrantRow(
  db: Database,
  scope: ScopeRef,
  resource: ResourceRef,
  feature: string,
): GrantRow | null {
  return db
    .query<GrantRow, [string, string, string, string, string]>(
      `SELECT id, scope_type, scope_id, resource_type, resource_id, feature,
              created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND resource_id = ?
         AND feature = ?
       ORDER BY revoked_at_ms IS NOT NULL ASC, created_at_ms DESC
       LIMIT 1`,
    )
    .get(scope.type, scope.id, resource.type, resource.id, feature);
}

export function grant(
  db: Database,
  scope: ScopeRef,
  resource: ResourceRef,
  feature: string,
  expiresAtMs?: number | null,
): string {
  const nowMs = Date.now();
  const existing = findGrantRow(db, scope, resource, feature);
  if (existing !== null) {
    if (existing.revoked_at_ms === null && isActive(existing, nowMs)) return existing.id;
    db.prepare(
      `UPDATE authz_grants
       SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
       WHERE id = ?`,
    ).run(expiresAtMs ?? null, nowMs, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO authz_grants (
         id, scope_type, scope_id, resource_type, resource_id, feature,
         created_at_ms, expired_at_ms, revoked_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      scope.type,
      scope.id,
      resource.type,
      resource.id,
      feature,
      nowMs,
      expiresAtMs ?? null,
    );
    return id;
  } catch {
    const raced = findGrantRow(db, scope, resource, feature);
    if (raced === null) throw new Error("grant insert failed");
    if (raced.revoked_at_ms === null && isActive(raced, nowMs)) return raced.id;
    db.prepare(
      `UPDATE authz_grants
       SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
       WHERE id = ?`,
    ).run(expiresAtMs ?? null, nowMs, raced.id);
    return raced.id;
  }
}

export function revokeGrant(
  db: Database,
  scope: ScopeRef,
  resource: ResourceRef,
  feature: string,
  nowMs = Date.now(),
): void {
  db.prepare(
    `UPDATE authz_grants
     SET revoked_at_ms = ?
     WHERE scope_type = ? AND scope_id = ?
       AND resource_type = ? AND resource_id = ?
       AND feature = ?
       AND revoked_at_ms IS NULL`,
  ).run(nowMs, scope.type, scope.id, resource.type, resource.id, feature);
}

export function revokeActiveGrantsForScopeFeature(
  db: Database,
  scope: ScopeRef,
  feature: string,
  resourceType?: string,
  nowMs = Date.now(),
): void {
  if (resourceType !== undefined) {
    db.prepare(
      `UPDATE authz_grants
       SET revoked_at_ms = ?
       WHERE scope_type = ? AND scope_id = ?
         AND feature = ?
         AND resource_type = ?
         AND revoked_at_ms IS NULL`,
    ).run(nowMs, scope.type, scope.id, feature, resourceType);
    return;
  }

  db.prepare(
    `UPDATE authz_grants
     SET revoked_at_ms = ?
     WHERE scope_type = ? AND scope_id = ?
       AND feature = ?
       AND revoked_at_ms IS NULL`,
  ).run(nowMs, scope.type, scope.id, feature);
}

export function hasGrant(
  db: Database,
  scope: ScopeRef,
  resource: ResourceRef,
  feature: string,
  nowMs = Date.now(),
): boolean {
  const row = db
    .query<{ c: number }, [string, string, string, string, string, number]>(
      `SELECT COUNT(1) AS c FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND resource_id = ?
         AND feature = ?
         AND ${ACTIVE_GRANT_SQL}`,
    )
    .get(scope.type, scope.id, resource.type, resource.id, feature, nowMs);
  return row !== null && row.c > 0;
}

export function listGrantsForScope(
  db: Database,
  scope: ScopeRef,
  nowMs = Date.now(),
): GrantRecord[] {
  const rows = db
    .query<GrantRow, [string, string, number]>(
      `SELECT id, scope_type, scope_id, resource_type, resource_id, feature,
              created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND ${ACTIVE_GRANT_SQL}
       ORDER BY created_at_ms ASC`,
    )
    .all(scope.type, scope.id, nowMs);
  return rows.map(mapGrant);
}

export function listGrantScopeIdsForResource(
  db: Database,
  resource: ResourceRef,
  feature: string,
  scopeType: string,
  nowMs = Date.now(),
): string[] {
  const rows = db
    .query<{ scope_id: string }, [string, string, string, string, number]>(
      `SELECT scope_id FROM authz_grants
       WHERE resource_type = ? AND resource_id = ?
         AND feature = ? AND scope_type = ?
         AND ${ACTIVE_GRANT_SQL}
       ORDER BY created_at_ms ASC`,
    )
    .all(resource.type, resource.id, feature, scopeType, nowMs);
  return rows.map((row) => row.scope_id);
}

export function getOrgIdForTeam(db: Database, teamId: string, nowMs = Date.now()): string | null {
  const row = db
    .query<{ resource_id: string }, [string, number]>(
      `SELECT resource_id FROM authz_grants
       WHERE scope_type = 'team' AND scope_id = ?
         AND resource_type = 'org' AND feature = 'member'
         AND ${ACTIVE_GRANT_SQL}
       LIMIT 1`,
    )
    .get(teamId, nowMs);
  return row?.resource_id ?? null;
}

export function listTeamIdsForOrg(db: Database, orgId: string, nowMs = Date.now()): string[] {
  const rows = db
    .query<{ scope_id: string }, [string, number]>(
      `SELECT scope_id FROM authz_grants
       WHERE resource_type = 'org' AND resource_id = ?
         AND feature = 'member' AND scope_type = 'team'
         AND ${ACTIVE_GRANT_SQL}
       ORDER BY created_at_ms ASC`,
    )
    .all(orgId, nowMs);
  return rows.map((row) => row.scope_id);
}

export function listAccountIdsForTeam(
  db: Database,
  teamId: string,
  feature = "member",
  nowMs = Date.now(),
): string[] {
  return listGrantScopeIdsForResource(db, { type: "team", id: teamId }, feature, "account", nowMs);
}

export function listAccountIdsForOrgAdmin(
  db: Database,
  orgId: string,
  nowMs = Date.now(),
): string[] {
  return listGrantScopeIdsForResource(db, { type: "org", id: orgId }, "admin", "account", nowMs);
}

export function userHasAnyTeamMemberGrant(
  db: Database,
  accountId: string,
  nowMs = Date.now(),
): boolean {
  const row = db
    .query<{ c: number }, [string, number]>(
      `SELECT COUNT(1) AS c FROM authz_grants
       WHERE scope_type = 'account' AND scope_id = ?
         AND resource_type = 'team' AND feature = 'member'
         AND ${ACTIVE_GRANT_SQL}`,
    )
    .get(accountId, nowMs);
  return row !== null && row.c > 0;
}

export function userHasAnySessionParticipantGrant(
  db: Database,
  accountId: string,
  nowMs = Date.now(),
): boolean {
  const row = db
    .query<{ c: number }, [string, number]>(
      `SELECT COUNT(1) AS c FROM authz_grants
       WHERE scope_type = 'account' AND scope_id = ?
         AND resource_type = 'session' AND feature = 'participant'
         AND ${ACTIVE_GRANT_SQL}`,
    )
    .get(accountId, nowMs);
  return row !== null && row.c > 0;
}

export function revokeAllGrantsForTeamScope(
  db: Database,
  teamId: string,
  nowMs = Date.now(),
): void {
  revokeActiveGrantsForScopeFeature(db, { type: "team", id: teamId }, "member", "org", nowMs);
}

export function revokeAllGrantsReferencingTeam(
  db: Database,
  teamId: string,
  nowMs = Date.now(),
): void {
  db.prepare(
    `UPDATE authz_grants
     SET revoked_at_ms = ?
     WHERE resource_type = 'team' AND resource_id = ?
       AND revoked_at_ms IS NULL`,
  ).run(nowMs, teamId);
}

export function revokeAllGrantsReferencingOrg(
  db: Database,
  orgId: string,
  nowMs = Date.now(),
): void {
  db.prepare(
    `UPDATE authz_grants
     SET revoked_at_ms = ?
     WHERE resource_type = 'org' AND resource_id = ?
       AND revoked_at_ms IS NULL`,
  ).run(nowMs, orgId);
}

export { isActive };
