import { Database, type DatabaseOptions } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import * as sqliteVec from "sqlite-vec";
import { sqliteDdlFromSchema } from "./_lib";
import { initTextFeaturesFts } from "./search-indexes";

export function loadSqliteVec(db: Database): void {
  try {
    sqliteVec.load(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/dynamic extension loading|not support.*extension/i.test(msg)) {
      throw new Error(
        `${msg}\n\n` +
          "sqlite-vec requires SQLite built with extension loading. Bun's bundled SQLite often does not support it.\n" +
          "Install Homebrew SQLite and point Bun at it, e.g.:\n" +
          "  brew install sqlite\n" +
          '  export SQLITE_CUSTOM_LIB="$(brew --prefix sqlite)/lib/libsqlite3.dylib"\n' +
          "(macOS). See SQLITE_CUSTOM_LIB in apps/matchmaking/.env.example.",
      );
    }
    throw e;
  }
}

export const MEMORIES_SCHEMA_SQL = sqliteDdlFromSchema(memoriesPersistenceDocumentSchema);

/** One assignment per (node|edge, label kind); enables INSERT OR REPLACE upserts. */
export const MEMORIES_UNIQUE_ASSIGNMENT_INDEXES_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_node_label_assignments_node_label
  ON node_label_assignments (node_id, label_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_label_assignments_edge_label
  ON edge_label_assignments (edge_id, label_id);
CREATE INDEX IF NOT EXISTS idx_memories_ns_prefixes
  ON memories (ns_prefix_1, ns_prefix_2, ns_prefix_3, ns_prefix_4, ns_prefix_5, ns_prefix_6);
`;

export type OpenMemoriesDatabaseOptions = DatabaseOptions;

export const SQLITE_CUSTOM_LIB_ENV = "SQLITE_CUSTOM_LIB";

let didConfigureCustomSqlite = false;

/** Resolve `$(brew --prefix sqlite)/lib/libsqlite3.dylib` when Homebrew sqlite is installed. */
function tryHomebrewSqliteDylibPath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const prefix = execFileSync("brew", ["--prefix", "sqlite"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (prefix.length === 0) return undefined;
    const p = join(prefix, "lib", "libsqlite3.dylib");
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

export function ensureCustomSqliteForExtensions(): void {
  if (didConfigureCustomSqlite) return;
  didConfigureCustomSqlite = true;

  const fromEnv = process.env[SQLITE_CUSTOM_LIB_ENV]?.trim();
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);

  const brewSqlite = tryHomebrewSqliteDylibPath();
  if (brewSqlite !== undefined) candidates.push(brewSqlite);

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
