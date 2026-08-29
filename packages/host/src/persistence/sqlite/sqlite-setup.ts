import type { Database } from "bun:sqlite";
import { openMaybeEncryptedDatabaseSync } from "@khoralabs/colonnade/crypto";
import { KHORA_HOST_PROJECTIONS_DDL } from "../core/schema/host-projections-ddl";
import { ensurePrincipalTeardownJobsSchema } from "./teardown-queue";

export function ensureKhoraHostProjectionsSchema(db: Database): void {
  db.run(KHORA_HOST_PROJECTIONS_DDL);
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
