import type { SqlDatabase } from "./sql";
import { all, get, run } from "./sql";
import type { EntityRef, GrantRecord, RelationshipRecord } from "./types";

const ACTIVE_SQL = `(revoked_at_ms IS NULL AND (expired_at_ms IS NULL OR expired_at_ms > ?))`;

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

type RelationshipRow = {
  id: string;
  from_type: string;
  from_id: string;
  relation: string;
  to_type: string;
  to_id: string;
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

function mapRelationship(row: RelationshipRow): RelationshipRecord {
  return {
    id: row.id,
    fromType: row.from_type,
    fromId: row.from_id,
    relation: row.relation,
    toType: row.to_type,
    toId: row.to_id,
    createdAtMs: row.created_at_ms,
    expiredAtMs: row.expired_at_ms,
    revokedAtMs: row.revoked_at_ms,
  };
}

export class AuthzRepository {
  constructor(private readonly db: SqlDatabase) {}

  async grant(
    scope: EntityRef,
    resource: EntityRef,
    feature: string,
    expiresAtMs?: number | null,
  ): Promise<string> {
    const nowMs = Date.now();
    const existing = await this.findGrant(scope, resource, feature);
    if (existing !== null) {
      if (existing.revokedAtMs === null && this.isActive(existing, nowMs)) return existing.id;
      await run(
        this.db,
        `UPDATE authz_grants
         SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
         WHERE id = ?`,
        [expiresAtMs ?? null, nowMs, existing.id],
      );
      return existing.id;
    }

    const id = crypto.randomUUID();
    try {
      await run(
        this.db,
        `INSERT INTO authz_grants (
           id, scope_type, scope_id, resource_type, resource_id, feature,
           created_at_ms, expired_at_ms, revoked_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, scope.type, scope.id, resource.type, resource.id, feature, nowMs, expiresAtMs ?? null],
      );
      return id;
    } catch {
      const raced = await this.findGrant(scope, resource, feature);
      if (raced === null) throw new Error("grant insert failed");
      if (raced.revokedAtMs === null && this.isActive(raced, nowMs)) return raced.id;
      await run(
        this.db,
        `UPDATE authz_grants
         SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
         WHERE id = ?`,
        [expiresAtMs ?? null, nowMs, raced.id],
      );
      return raced.id;
    }
  }

  async revokeGrant(
    scope: EntityRef,
    resource: EntityRef,
    feature: string,
    nowMs = Date.now(),
  ): Promise<void> {
    await run(
      this.db,
      `UPDATE authz_grants
       SET revoked_at_ms = ?
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND resource_id = ?
         AND feature = ?
         AND revoked_at_ms IS NULL`,
      [nowMs, scope.type, scope.id, resource.type, resource.id, feature],
    );
  }

  async hasGrant(
    scope: EntityRef,
    resource: EntityRef,
    feature: string,
    nowMs = Date.now(),
  ): Promise<boolean> {
    const row = await get<{ c: number }>(
      this.db,
      `SELECT COUNT(1) AS c FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND resource_id = ?
         AND feature = ?
         AND ${ACTIVE_SQL}`,
      [scope.type, scope.id, resource.type, resource.id, feature, nowMs],
    );
    return row !== null && row.c > 0;
  }

  async listGrantScopeIdsForResource(
    resource: EntityRef,
    feature: string,
    scopeType: string,
    nowMs = Date.now(),
  ): Promise<string[]> {
    const rows = await all<{ scope_id: string }>(
      this.db,
      `SELECT scope_id FROM authz_grants
       WHERE resource_type = ? AND resource_id = ?
         AND feature = ? AND scope_type = ?
         AND ${ACTIVE_SQL}
       ORDER BY created_at_ms ASC`,
      [resource.type, resource.id, feature, scopeType, nowMs],
    );
    return rows.map((row) => row.scope_id);
  }

  async listGrantsForScope(scope: EntityRef, nowMs = Date.now()): Promise<GrantRecord[]> {
    const rows = await all<GrantRow>(
      this.db,
      `SELECT id, scope_type, scope_id, resource_type, resource_id, feature,
              created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND ${ACTIVE_SQL}
       ORDER BY created_at_ms ASC`,
      [scope.type, scope.id, nowMs],
    );
    return rows.map(mapGrant);
  }

  async listGrantResourceIdsForScope(
    scope: EntityRef,
    feature: string,
    resourceType: string,
    nowMs = Date.now(),
  ): Promise<string[]> {
    const rows = await all<{ resource_id: string }>(
      this.db,
      `SELECT resource_id FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND feature = ? AND resource_type = ?
         AND ${ACTIVE_SQL}
       ORDER BY created_at_ms ASC`,
      [scope.type, scope.id, feature, resourceType, nowMs],
    );
    return rows.map((row) => row.resource_id);
  }

  async scopeHasAnyGrant(
    scope: EntityRef,
    resourceType: string,
    feature: string,
    nowMs = Date.now(),
  ): Promise<boolean> {
    const row = await get<{ c: number }>(
      this.db,
      `SELECT COUNT(1) AS c FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND feature = ?
         AND ${ACTIVE_SQL}`,
      [scope.type, scope.id, resourceType, feature, nowMs],
    );
    return row !== null && row.c > 0;
  }

  async revokeActiveGrantsForScopeFeature(
    scope: EntityRef,
    feature: string,
    resourceType?: string,
    nowMs = Date.now(),
  ): Promise<void> {
    if (resourceType !== undefined) {
      await run(
        this.db,
        `UPDATE authz_grants
         SET revoked_at_ms = ?
         WHERE scope_type = ? AND scope_id = ?
           AND feature = ?
           AND resource_type = ?
           AND revoked_at_ms IS NULL`,
        [nowMs, scope.type, scope.id, feature, resourceType],
      );
      return;
    }
    await run(
      this.db,
      `UPDATE authz_grants
       SET revoked_at_ms = ?
       WHERE scope_type = ? AND scope_id = ?
         AND feature = ?
         AND revoked_at_ms IS NULL`,
      [nowMs, scope.type, scope.id, feature],
    );
  }

  async revokeAllGrantsReferencingResource(resource: EntityRef, nowMs = Date.now()): Promise<void> {
    await run(
      this.db,
      `UPDATE authz_grants
       SET revoked_at_ms = ?
       WHERE resource_type = ? AND resource_id = ?
         AND revoked_at_ms IS NULL`,
      [nowMs, resource.type, resource.id],
    );
  }

  async relate(
    from: EntityRef,
    relation: string,
    to: EntityRef,
    expiresAtMs?: number | null,
  ): Promise<string> {
    const nowMs = Date.now();
    const existing = await this.findRelationship(from, relation, to);
    if (existing !== null) {
      if (existing.revokedAtMs === null && this.isActive(existing, nowMs)) return existing.id;
      await run(
        this.db,
        `UPDATE authz_relationships
         SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
         WHERE id = ?`,
        [expiresAtMs ?? null, nowMs, existing.id],
      );
      return existing.id;
    }

    const id = crypto.randomUUID();
    try {
      await run(
        this.db,
        `INSERT INTO authz_relationships (
           id, from_type, from_id, relation, to_type, to_id,
           created_at_ms, expired_at_ms, revoked_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, from.type, from.id, relation, to.type, to.id, nowMs, expiresAtMs ?? null],
      );
      return id;
    } catch {
      const raced = await this.findRelationship(from, relation, to);
      if (raced === null) throw new Error("relationship insert failed");
      if (raced.revokedAtMs === null && this.isActive(raced, nowMs)) return raced.id;
      await run(
        this.db,
        `UPDATE authz_relationships
         SET revoked_at_ms = NULL, expired_at_ms = ?, created_at_ms = ?
         WHERE id = ?`,
        [expiresAtMs ?? null, nowMs, raced.id],
      );
      return raced.id;
    }
  }

  async revokeRelationship(
    from: EntityRef,
    relation: string,
    to: EntityRef,
    nowMs = Date.now(),
  ): Promise<void> {
    await run(
      this.db,
      `UPDATE authz_relationships
       SET revoked_at_ms = ?
       WHERE from_type = ? AND from_id = ?
         AND relation = ?
         AND to_type = ? AND to_id = ?
         AND revoked_at_ms IS NULL`,
      [nowMs, from.type, from.id, relation, to.type, to.id],
    );
  }

  async listRelatedFrom(
    to: EntityRef,
    relation: string,
    fromType?: string,
    nowMs = Date.now(),
  ): Promise<EntityRef[]> {
    const rows = await all<{ from_type: string; from_id: string }>(
      this.db,
      `SELECT from_type, from_id FROM authz_relationships
       WHERE to_type = ? AND to_id = ?
         AND relation = ?
         AND (? IS NULL OR from_type = ?)
         AND ${ACTIVE_SQL}
       ORDER BY created_at_ms ASC`,
      [to.type, to.id, relation, fromType ?? null, fromType ?? null, nowMs],
    );
    return rows.map((row) => ({ type: row.from_type, id: row.from_id }));
  }

  async getRelatedTo(
    from: EntityRef,
    relation: string,
    toType?: string,
    nowMs = Date.now(),
  ): Promise<EntityRef[]> {
    const rows = await all<{ to_type: string; to_id: string }>(
      this.db,
      `SELECT to_type, to_id FROM authz_relationships
       WHERE from_type = ? AND from_id = ?
         AND relation = ?
         AND (? IS NULL OR to_type = ?)
         AND ${ACTIVE_SQL}
       ORDER BY created_at_ms ASC`,
      [from.type, from.id, relation, toType ?? null, toType ?? null, nowMs],
    );
    return rows.map((row) => ({ type: row.to_type, id: row.to_id }));
  }

  async recordDecision(input: {
    subject: EntityRef;
    action: string;
    resource: EntityRef;
    allowed: boolean;
    reason?: string;
  }): Promise<void> {
    await run(
      this.db,
      `INSERT INTO authz_decision_audit (
         id, subject_type, subject_id, action, resource_type, resource_id,
         allowed, reason, created_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.subject.type,
        input.subject.id,
        input.action,
        input.resource.type,
        input.resource.id,
        input.allowed ? 1 : 0,
        input.reason ?? null,
        Date.now(),
      ],
    );
  }

  private async findGrant(
    scope: EntityRef,
    resource: EntityRef,
    feature: string,
  ): Promise<GrantRecord | null> {
    const row = await get<GrantRow>(
      this.db,
      `SELECT id, scope_type, scope_id, resource_type, resource_id, feature,
              created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_grants
       WHERE scope_type = ? AND scope_id = ?
         AND resource_type = ? AND resource_id = ?
         AND feature = ?
       ORDER BY revoked_at_ms IS NOT NULL ASC, created_at_ms DESC
       LIMIT 1`,
      [scope.type, scope.id, resource.type, resource.id, feature],
    );
    return row === null ? null : mapGrant(row);
  }

  private async findRelationship(
    from: EntityRef,
    relation: string,
    to: EntityRef,
  ): Promise<RelationshipRecord | null> {
    const row = await get<RelationshipRow>(
      this.db,
      `SELECT id, from_type, from_id, relation, to_type, to_id,
              created_at_ms, expired_at_ms, revoked_at_ms
       FROM authz_relationships
       WHERE from_type = ? AND from_id = ?
         AND relation = ?
         AND to_type = ? AND to_id = ?
       ORDER BY revoked_at_ms IS NOT NULL ASC, created_at_ms DESC
       LIMIT 1`,
      [from.type, from.id, relation, to.type, to.id],
    );
    return row === null ? null : mapRelationship(row);
  }

  private isActive(row: { revokedAtMs: number | null; expiredAtMs: number | null }, nowMs: number) {
    if (row.revokedAtMs !== null) return false;
    if (row.expiredAtMs !== null && row.expiredAtMs <= nowMs) return false;
    return true;
  }
}
