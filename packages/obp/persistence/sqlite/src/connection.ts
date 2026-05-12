import { Database } from "bun:sqlite";
import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import m001Initial from "./migrations/0.0.0-0.1.0/001-initial";
import m002PortsTtlColumns from "./migrations/0.1.0-0.2.0/001-ports-ttl-columns";
import m003BindsCounterpartyColumns from "./migrations/0.1.0-0.2.0/002-binds-counterparty-columns";

const migrations = [m001Initial, m002PortsTtlColumns, m003BindsCounterpartyColumns];

/** Run idempotent DDL (safe to call on every open). */
export function initObpSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  createMigrationRunner().runSync(db, migrations);
}

/** Open (or create) a SQLite file and initialize OBP tables. */
export function openObpDatabase(filename: string): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { create: true });
  initObpSchema(db);
  return db;
}
