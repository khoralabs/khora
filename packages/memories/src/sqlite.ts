import { Database, type DatabaseOptions } from "bun:sqlite";
import { existsSync } from "node:fs";
import * as sqliteVec from "sqlite-vec";
import { sqliteDdlFromSchema } from "./_lib";
import { schema } from "./db/schema";
import { initTextFeaturesFts } from "./db/search-indexes";

/**
 * Loads [sqlite-vec](https://alexgarcia.xyz/sqlite-vec/js.html) SQL functions (`vec_*`, virtual tables, etc.)
 * into the connection. Call once per `Database` after {@link ensureCustomSqliteForExtensions} on macOS.
 */
export function loadSqliteVec(db: Database): void {
  sqliteVec.load(db);
}

/** DDL derived from {@link schema} via {@link sqliteDdlFromSchema} (tables, FKs, indexes). */
export const MEMORIES_SCHEMA_SQL = sqliteDdlFromSchema(schema);

export type OpenMemoriesDatabaseOptions = DatabaseOptions;

/**
 * Absolute path to `libsqlite3` for {@link Database.setCustomSQLite}. Set in production when Homebrew
 * paths differ, in CI, or on Intel vs Apple Silicon Macs.
 *
 * @see https://bun.sh/docs/api/sqlite#loadextension-macos
 */
export const SQLITE_CUSTOM_LIB_ENV = "SQLITE_CUSTOM_LIB";

let didConfigureCustomSqlite = false;

/**
 * On **macOS**, Apple’s system SQLite does not load extensions; Bun can use Homebrew’s `libsqlite3.dylib`
 * via {@link Database.setCustomSQLite} **before** any `Database` is created. On Linux/Windows this is a
 * no-op in Bun unless you set {@link SQLITE_CUSTOM_LIB_ENV} to a valid library path.
 *
 * Resolution order: `process.env[SQLITE_CUSTOM_LIB_ENV]`, then common Homebrew locations (only when the
 * file exists). Safe to call multiple times.
 */
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

/** Create (if needed) and open a file-backed DB, load sqlite-vec, then enable FKs + WAL and apply {@link MEMORIES_SCHEMA_SQL}. */
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

/** `PRAGMA foreign_keys`, `journal_mode = WAL`, then create tables/indexes from {@link MEMORIES_SCHEMA_SQL}. */
export function initMemoriesSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.run(MEMORIES_SCHEMA_SQL);
  initTextFeaturesFts(db);
}

/** Serialize `vector` (512–3072 floats per `zVectorFeature`) for `vector_features.vector` BLOB columns. */
export function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

/** Read a `vector_features.vector` BLOB back to floats. */
export function blobToVector(blob: Uint8Array | Buffer): Float32Array {
  return new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}
