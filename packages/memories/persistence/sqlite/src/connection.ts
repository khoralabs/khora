import { Database, type DatabaseOptions } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { memoriesPersistenceDocumentSchema } from "@khoralabs/memories-core/persistence";
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
          "(macOS). On Linux, install libsqlite3 (distro package) and set SQLITE_CUSTOM_LIB to the\n" +
          "  shared library path if needed (e.g. /usr/lib/x86_64-linux-gnu/libsqlite3.so.0).\n" +
          "  See SQLITE_CUSTOM_LIB in apps/matchmaking/.env.example.",
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_provenance_root_hex
  ON memory_provenance (root_hex);
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

  if (process.platform === "linux") {
    candidates.push(
      "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0",
      "/usr/lib/x86_64-linux-gnu/libsqlite3.so",
      "/usr/lib/aarch64-linux-gnu/libsqlite3.so.0",
      "/usr/lib/aarch64-linux-gnu/libsqlite3.so",
      "/lib/x86_64-linux-gnu/libsqlite3.so.0",
      "/lib/aarch64-linux-gnu/libsqlite3.so.0",
    );
  }

  for (const p of candidates) {
    if (p.length > 0 && existsSync(p)) {
      Database.setCustomSQLite(p);
      return;
    }
  }
}

export type MemoriesSqlitePragmaOptions = {
  /** KiB of page cache, supplied to `PRAGMA cache_size` as a negative value. Default 65536 (~64 MiB). */
  cacheSizeKiB?: number;
  /** Bytes for `PRAGMA mmap_size`. Default 268435456 (256 MiB). Set to 0 to disable. */
  mmapSizeBytes?: number;
  /** ms for `PRAGMA busy_timeout`. Default 5000. */
  busyTimeoutMs?: number;
  /** Pages for `PRAGMA wal_autocheckpoint`. Default 1000 (SQLite default — set explicitly for clarity). */
  walAutocheckpointPages?: number;
};

/**
 * Apply production-tuned SQLite pragmas: WAL + NORMAL sync, busy_timeout, mmap, cache,
 * temp_store=MEMORY, and an explicit wal_autocheckpoint. Idempotent; safe to call on
 * connections that already have these set. Foreign keys are enforced (`memories-core`
 * relies on FK cascades) for parity with previous behavior.
 *
 * Notes on `synchronous = NORMAL`: with WAL journaling this is the documented sweet
 * spot — a crash can lose the most recent committed transaction but cannot corrupt
 * the database. `FULL` only adds one extra `fsync` per commit and is unnecessary here.
 */
export function configureMemoriesSqlitePragmas(
  db: Database,
  opts: MemoriesSqlitePragmaOptions = {},
): void {
  const cacheSizeKiB = opts.cacheSizeKiB ?? 65536;
  const mmapSizeBytes = opts.mmapSizeBytes ?? 268435456;
  const busyTimeoutMs = opts.busyTimeoutMs ?? 5000;
  const walAutocheckpointPages = opts.walAutocheckpointPages ?? 1000;

  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
  db.run(`PRAGMA cache_size = -${cacheSizeKiB};`);
  db.run(`PRAGMA mmap_size = ${mmapSizeBytes};`);
  db.run("PRAGMA temp_store = MEMORY;");
  db.run(`PRAGMA wal_autocheckpoint = ${walAutocheckpointPages};`);
}

export function openMemoriesDatabase(
  filename: string,
  options: OpenMemoriesDatabaseOptions = {},
): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { create: true, ...options });
  configureMemoriesSqlitePragmas(db);
  loadSqliteVec(db);
  initMemoriesSchema(db);
  return db;
}

export function openMemoriesDatabaseReadonly(filename: string): Database {
  ensureCustomSqliteForExtensions();
  const db = new Database(filename, { readonly: true });
  db.run("PRAGMA busy_timeout = 5000;");
  db.run("PRAGMA mmap_size = 268435456;");
  db.run("PRAGMA cache_size = -65536;");
  db.run("PRAGMA temp_store = MEMORY;");
  loadSqliteVec(db);
  return db;
}

/** Best-effort DDL for DBs created before `content_hash` existed on `source_maps`. */
export function migrateMemoriesSchemaAdditive(db: Database): void {
  try {
    db.run(`ALTER TABLE source_maps ADD COLUMN content_hash TEXT`);
  } catch {
    /* column already present */
  }
  try {
    db.run(`ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'node'`);
  } catch {
    /* column already present */
  }
  try {
    db.run(`ALTER TABLE memories ADD COLUMN edge_id TEXT`);
  } catch {
    /* column already present */
  }
  try {
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_edge_id_unique ON memories(edge_id) WHERE edge_id IS NOT NULL`,
    );
  } catch {
    /* index exists or legacy schema */
  }
}

export function initMemoriesSchema(db: Database): void {
  configureMemoriesSqlitePragmas(db);
  db.run(MEMORIES_SCHEMA_SQL);
  migrateMemoriesSchemaAdditive(db);
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
