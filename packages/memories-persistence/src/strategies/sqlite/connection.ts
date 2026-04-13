import { Database, type DatabaseOptions } from "bun:sqlite";
import { existsSync } from "node:fs";
import * as sqliteVec from "sqlite-vec";
import { sqliteDdlFromSchema } from "./_lib";
import { schema } from "./schema";
import { initTextFeaturesFts } from "./search-indexes";

export function loadSqliteVec(db: Database): void {
  sqliteVec.load(db);
}

export const MEMORIES_SCHEMA_SQL = sqliteDdlFromSchema(schema);

/** One assignment per (node|edge, label kind); enables INSERT OR REPLACE upserts. */
export const MEMORIES_UNIQUE_ASSIGNMENT_INDEXES_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_node_label_assignments_node_label
  ON node_label_assignments (node_id, label_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_label_assignments_edge_label
  ON edge_label_assignments (edge_id, label_id);
`;

export type OpenMemoriesDatabaseOptions = DatabaseOptions;

export const SQLITE_CUSTOM_LIB_ENV = "SQLITE_CUSTOM_LIB";

let didConfigureCustomSqlite = false;

export function ensureCustomSqliteForExtensions(): void {
  if (didConfigureCustomSqlite) return;
  didConfigureCustomSqlite = true;

  const fromEnv = process.env[SQLITE_CUSTOM_LIB_ENV]?.trim();
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
      "/opt/homebrew/opt/sqlite3/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite3/lib/libsqlite3.dylib",
    );
  }

  for (const p of candidates) {
    if (p.length > 0 && existsSync(p)) {
      Database.setCustomSQLite(p);
      return;
    }
  }
}

export function openMemoriesDatabase(
  filename: string,
  options: OpenMemoriesDatabaseOptions = {},
): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { create: true, ...options });
  loadSqliteVec(db);
  initMemoriesSchema(db);
  return db;
}

export function openMemoriesDatabaseReadonly(filename: string): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { readonly: true });
  loadSqliteVec(db);
  return db;
}

export function initMemoriesSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.run(MEMORIES_SCHEMA_SQL);
  db.run(MEMORIES_UNIQUE_ASSIGNMENT_INDEXES_SQL);
  initTextFeaturesFts(db);
}

export function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function blobToVector(blob: Uint8Array | Buffer): Float32Array {
  return new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}
