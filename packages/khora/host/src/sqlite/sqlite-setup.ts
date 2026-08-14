import type { Database } from "bun:sqlite";
import { openMaybeEncryptedDatabaseSync } from "@khoralabs/colonnade/crypto";
import { ensurePrincipalTeardownJobsSchema } from "./teardown-queue";

export function ensureKhoraHostProjectionsSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS khora_host_projections (
      tenant_key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      projection JSON NOT NULL CHECK (json_valid(projection)),
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (tenant_key, namespace, entry_key)
    );
    CREATE INDEX IF NOT EXISTS idx_khora_username_to_principal
      ON khora_host_projections (
        tenant_key,
        json_extract(projection, '$.principalId')
      )
      WHERE namespace = 'khora:social:username-to-principal';
    CREATE TABLE IF NOT EXISTS khora_social_principal_channels (
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

export function applyKhoraSqlitePragmas(db: Database): void {
  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
    PRAGMA mmap_size = 268435456;
    PRAGMA temp_store = MEMORY;
  `);
}

/** Open host DB (SQLCipher when `sqlCipherKey` is set) and ensure host-owned schemas. */
export async function openKhoraHostDb(path: string, sqlCipherKey?: string): Promise<Database> {
  const db = openMaybeEncryptedDatabaseSync(path, { create: true }, sqlCipherKey);
  applyKhoraSqlitePragmas(db);
  ensureKhoraHostProjectionsSchema(db);
  ensurePrincipalTeardownJobsSchema(db);
  return db;
}
