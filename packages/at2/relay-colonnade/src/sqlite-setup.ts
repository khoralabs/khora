import { Database } from "bun:sqlite";
import { SqliteCatalogPersistenceStrategy } from "@khoralabs/colonnade-persistence";

/** WAL + defaults aligned with colonnade SQLite workloads. */
export function applyRelaySqlitePragmas(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
    PRAGMA mmap_size = 268435456;
    PRAGMA temp_store = MEMORY;
  `);
}

/** Opens catalog DB and ensures colonnade catalog schema (via strategy constructor). */
export function openRelayCatalogDb(path: string): Database {
  const db = new Database(path, { create: true });
  new SqliteCatalogPersistenceStrategy(db);
  return db;
}

/** Relay frame-channel SQLite (separate file from catalog). */
export function openRelayFramesDb(path: string): Database {
  const db = new Database(path, { create: true });
  applyRelaySqlitePragmas(db);
  return db;
}
