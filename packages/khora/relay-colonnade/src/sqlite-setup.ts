import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import { ensurePercolatorSchema } from "@khoralabs/percolator-sqlite";
import { openEncryptedDatabase } from "@khoralabs/sqlite-crypto";
import { ensurePrincipalTeardownJobsSchema } from "./principal-teardown-jobs";

/** Tier 1 relay catalog projections (JSON columns + expression indexes). */
export function ensureRelayCatalogProjectionsSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS relay_catalog_projections (
      tenant_key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      projection JSON NOT NULL CHECK (json_valid(projection)),
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (tenant_key, namespace, entry_key)
    );
    CREATE INDEX IF NOT EXISTS idx_relay_username_to_principal
      ON relay_catalog_projections (
        tenant_key,
        json_extract(projection, '$.principalId')
      )
      WHERE namespace = 'relay:social:username-to-principal';
    CREATE TABLE IF NOT EXISTS relay_social_principal_channels (
      tenant_key TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      PRIMARY KEY (tenant_key, principal_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS agent_account_status (
      did TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('suspended', 'deleted')),
      created_at_ms INTEGER NOT NULL
    );
  `);
}

/** WAL + defaults aligned with colonnade SQLite workloads. */
export function applyRelaySqlitePragmas(db: Database): void {
  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
    PRAGMA mmap_size = 268435456;
    PRAGMA temp_store = MEMORY;
  `);
}

/** Opens relay catalog DB (Tier 1 projections + percolator standing queries). */
export async function openRelayCatalogDb(
  path: string,
  provider: EncryptionKeyProvider,
): Promise<Database> {
  const db = await openEncryptedDatabase(path, { create: true }, "khora", provider);
  applyRelaySqlitePragmas(db);
  ensureRelayCatalogProjectionsSchema(db);
  ensurePercolatorSchema(db);
  ensurePrincipalTeardownJobsSchema(db);
  return db;
}
