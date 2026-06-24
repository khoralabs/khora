import type { SqlDatabase } from "./sql";
import { exec, run } from "./sql";
import { EntityType, Feature, ORG_PERMISSIONS, Relation, TEAM_PERMISSIONS } from "./taxonomy";

export async function ensureAuthzServiceSchema(db: SqlDatabase): Promise<void> {
  await exec(
    db,
    `
    CREATE TABLE IF NOT EXISTS authz_scope_types (
      type TEXT PRIMARY KEY NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authz_grant_types (
      feature TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (feature, resource_type)
    );

    CREATE TABLE IF NOT EXISTS authz_relation_types (
      relation TEXT NOT NULL,
      from_type TEXT NOT NULL,
      to_type TEXT NOT NULL,
      transitive INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (relation, from_type, to_type)
    );

    CREATE TABLE IF NOT EXISTS authz_grants (
      id TEXT PRIMARY KEY NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expired_at_ms INTEGER,
      revoked_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_authz_grants_scope
      ON authz_grants(scope_type, scope_id);

    CREATE INDEX IF NOT EXISTS idx_authz_grants_resource
      ON authz_grants(resource_type, resource_id, feature);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_authz_grants_active_tuple
      ON authz_grants(scope_type, scope_id, resource_type, resource_id, feature)
      WHERE revoked_at_ms IS NULL;

    CREATE TABLE IF NOT EXISTS authz_relationships (
      id TEXT PRIMARY KEY NOT NULL,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expired_at_ms INTEGER,
      revoked_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_authz_relationships_from
      ON authz_relationships(from_type, from_id, relation);

    CREATE INDEX IF NOT EXISTS idx_authz_relationships_to
      ON authz_relationships(to_type, to_id, relation);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_authz_relationships_active_tuple
      ON authz_relationships(from_type, from_id, relation, to_type, to_id)
      WHERE revoked_at_ms IS NULL;

    CREATE TABLE IF NOT EXISTS authz_decision_audit (
      id TEXT PRIMARY KEY NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      reason TEXT,
      created_at_ms INTEGER NOT NULL
    );
    `,
  );

  await seedTaxonomy(db);
}

async function seedTaxonomy(db: SqlDatabase): Promise<void> {
  const nowMs = Date.now();
  for (const type of Object.values(EntityType)) {
    await run(db, `INSERT OR IGNORE INTO authz_scope_types (type, created_at_ms) VALUES (?, ?)`, [
      type,
      nowMs,
    ]);
  }

  const grantTypes: Array<[string, string]> = [
    [Feature.Member, EntityType.Team],
    [Feature.Member, EntityType.Organization],
    [Feature.Admin, EntityType.Organization],
    [Feature.Admin, EntityType.Team],
    [Feature.Admin, EntityType.Session],
    [Feature.Participant, EntityType.Session],
    [Feature.Facilitation, EntityType.Session],
    [Feature.Read, EntityType.Thread],
    [Feature.Read, EntityType.Session],
    [Feature.Read, EntityType.Account],
    [Feature.Write, EntityType.Thread],
    [Feature.Contributor, EntityType.Team],
    ...ORG_PERMISSIONS.map((feature) => [feature, EntityType.Organization] as [string, string]),
    ...TEAM_PERMISSIONS.map((feature) => [feature, EntityType.Team] as [string, string]),
  ];
  for (const [feature, resourceType] of grantTypes) {
    await run(
      db,
      `INSERT OR IGNORE INTO authz_grant_types (feature, resource_type, created_at_ms)
       VALUES (?, ?, ?)`,
      [feature, resourceType, nowMs],
    );
  }

  const relationTypes: Array<[string, string, string, number]> = [
    [Relation.MemberOf, EntityType.Team, EntityType.Organization, 0],
    [Relation.MemberOf, EntityType.Account, EntityType.Team, 0],
    [Relation.BelongsTo, EntityType.Session, EntityType.Team, 0],
    [Relation.BelongsTo, EntityType.Thread, EntityType.Session, 0],
    [Relation.ProtectedBy, EntityType.Document, EntityType.Account, 0],
    [Relation.ProtectedBy, EntityType.Document, EntityType.Organization, 0],
    [Relation.ProtectedBy, EntityType.Document, EntityType.Team, 0],
    [Relation.ProtectedBy, EntityType.Document, EntityType.Session, 0],
    [Relation.Represents, EntityType.Agent, EntityType.Organization, 0],
  ];
  for (const [relation, fromType, toType, transitive] of relationTypes) {
    await run(
      db,
      `INSERT OR IGNORE INTO authz_relation_types
        (relation, from_type, to_type, transitive, created_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [relation, fromType, toType, transitive, nowMs],
    );
  }
}
