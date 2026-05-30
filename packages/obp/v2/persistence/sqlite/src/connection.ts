import { Database } from "bun:sqlite";
import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-sqlite";
import { OBP_V2_SCHEMA_SQL } from "./schema";

/** Run frozen DDL (safe to call on every open). */
export function initObpV2Schema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.exec(OBP_V2_SCHEMA_SQL);
}

/** Open (or create) a SQLite file and initialize OBP v2 tables. */
export function openObpV2Database(filename: string): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { create: true });
  initObpV2Schema(db);
  return db;
}
