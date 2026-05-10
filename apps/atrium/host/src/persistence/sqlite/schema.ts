import type { Database } from "bun:sqlite";

/** Match memories-sqlite connection defaults: FK enforcement + WAL journaling. */
export function configureSwarmHostSqlitePragmas(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
}

/**
 * Swarm host SQLite DDL: OBP relay plus unified `host_entities` for profile/post/topic documents.
 *
 * Each row holds canonical JSON in `body_json`. {@link Store.resolve} uses `source_key` shapes:
 * - `{domain}:{id}` — whole document (e.g. `profile:p1`) → typed `kind: "record"` via parser.
 * - `{domain}:{id}:{field}` — one field from parsed JSON (e.g. `profile:p1:name`) → `kind: "string"`.
 *
 * Add future aggregates by extending allowed `kind` values and persistence slices (same table shape).
 */
export function ensureSwarmHostSqliteSchema(db: Database): void {
  configureSwarmHostSqlitePragmas(db);
  db.run(`
CREATE TABLE IF NOT EXISTS rooms (
  session_id TEXT PRIMARY KEY NOT NULL,
  pairing_secret_hex TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_messages_session ON room_messages(session_id, id);

CREATE TABLE IF NOT EXISTS host_entities (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  memory_id TEXT,
  body_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS idx_host_entities_memory ON host_entities(memory_id);
`);
}
