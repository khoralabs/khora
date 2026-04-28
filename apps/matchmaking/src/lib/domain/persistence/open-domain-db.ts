import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureCustomSqliteForExtensions } from "@cfd/memories-sqlite";
import { migrateMatchmakingDomainDb } from "./migrate-domain-db.ts";
import { resolveMatchmakingDomainDbPath } from "./resolve-domain-db.ts";

let singleton: Database | null = null;

/**
 * Process-wide domain DB: profile, invites, lexical store, etc. Separate from `memories.sqlite`.
 */
export function getMatchmakingDomainDatabase(): Database {
  if (singleton !== null) {
    return singleton;
  }
  /** Must run before any `new Database()` so Bun can swap libsqlite3 for sqlite-vec extension loading. */
  ensureCustomSqliteForExtensions();
  const path = resolveMatchmakingDomainDbPath();
  const dir = dirname(path);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(path, { create: true });
  migrateMatchmakingDomainDb(db);
  singleton = db;
  return db;
}

/**
 * For tests: replace singleton with a fresh in-memory or temp DB.
 */
export function setMatchmakingDomainDatabaseForTest(db: Database | null): void {
  if (singleton !== null && singleton !== db) {
    try {
      singleton.close();
    } catch {
      /* best effort */
    }
  }
  singleton = db;
}
