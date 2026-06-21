import type { Database } from "bun:sqlite";

export function ensureAuthzSchema(db: Database): void {
  db.run(`
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

    CREATE TABLE IF NOT EXISTS authz_entitlements (
      id TEXT PRIMARY KEY NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expired_at_ms INTEGER,
      revoked_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_authz_entitlements_scope
      ON authz_entitlements(scope_type, scope_id, feature);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_authz_entitlements_active_tuple
      ON authz_entitlements(scope_type, scope_id, feature)
      WHERE revoked_at_ms IS NULL;
  `);
}
