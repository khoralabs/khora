import { Database } from "bun:sqlite";
import { ensureCustomSqliteForExtensions } from "@cfd/memories-sqlite";
import { OBP_SCHEMA_SQL } from "./schema";

/** Add negotiation TTL columns to `obp_ports` when upgrading older DB files. */
function migrateObpPortsTtlColumns(db: Database): void {
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(obp_ports)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("ttl_basis")) {
    db.run("ALTER TABLE obp_ports ADD COLUMN ttl_basis TEXT");
  }
  if (!names.has("ttl_measure")) {
    db.run("ALTER TABLE obp_ports ADD COLUMN ttl_measure INTEGER");
  }
  if (!names.has("expose_turn_index")) {
    db.run("ALTER TABLE obp_ports ADD COLUMN expose_turn_index INTEGER");
  }
}

/** Run idempotent DDL (safe to call on every open). */
export function initObpSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.exec(OBP_SCHEMA_SQL);
  migrateObpPortsTtlColumns(db);
}

/** Open (or create) a SQLite file and initialize OBP tables. */
export function openObpDatabase(filename: string): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { create: true });
  initObpSchema(db);
  return db;
}
