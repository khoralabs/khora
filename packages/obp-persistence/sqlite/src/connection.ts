import { Database } from "bun:sqlite";
import { OBP_SCHEMA_SQL } from "./schema";

/** Run idempotent DDL (safe to call on every open). */
export function initObpSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.exec(OBP_SCHEMA_SQL);
}

/** Open (or create) a SQLite file and initialize OBP tables. */
export function openObpDatabase(filename: string): Database {
  const db = new Database(filename, { create: true });
  initObpSchema(db);
  return db;
}
