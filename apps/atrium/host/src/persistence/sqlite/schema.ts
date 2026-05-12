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
 *
 * Statements are executed one at a time rather than as a single multi-statement
 * `db.run` because the SQLite version Bun loads via `SQLITE_CUSTOM_LIB` can
 * defer schema-cache invalidation between batched statements, producing
 * "no such table" errors when a later CREATE INDEX references an earlier
 * CREATE TABLE that hasn't yet become visible in the same batch.
 */
const SWARM_HOST_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS rooms (
     session_id TEXT PRIMARY KEY NOT NULL,
     pairing_secret_hex TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS room_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id TEXT NOT NULL,
     bytes BLOB NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_room_messages_session ON room_messages(session_id, id)`,
  `CREATE TABLE IF NOT EXISTS host_entities (
     kind TEXT NOT NULL,
     id TEXT NOT NULL,
     memory_id TEXT,
     body_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (kind, id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_host_entities_memory ON host_entities(memory_id)`,
  `CREATE TABLE IF NOT EXISTS host_registrations (
     did TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT,
     registered_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS topic_subscriptions (
     did TEXT NOT NULL,
     topic_slug TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (did, topic_slug)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_topic_subscriptions_slug ON topic_subscriptions(topic_slug)`,
  `CREATE TABLE IF NOT EXISTS agent_notifications (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     did TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     kind TEXT NOT NULL,
     payload_json TEXT NOT NULL,
     read_at_ms INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_notifications_did_created ON agent_notifications(did, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_notifications_unread ON agent_notifications(did, read_at_ms)`,
  `CREATE TABLE IF NOT EXISTS atrium_invite_tokens (
     token_hash TEXT PRIMARY KEY NOT NULL,
     created_at_ms INTEGER NOT NULL,
     consumed_at_ms INTEGER,
     consumed_by_did TEXT,
     minted_by_did TEXT,
     kind TEXT NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_atrium_invite_one_root
     ON atrium_invite_tokens(kind)
     WHERE kind = 'root'`,
  `CREATE INDEX IF NOT EXISTS idx_atrium_invite_minter ON atrium_invite_tokens(minted_by_did, created_at_ms)`,
  `CREATE TABLE IF NOT EXISTS atrium_usernames (
     username TEXT PRIMARY KEY NOT NULL,
     did TEXT NOT NULL UNIQUE,
     created_at_ms INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS probe_subscribers (
     probe_post_id TEXT PRIMARY KEY NOT NULL,
     owner_profile_id TEXT NOT NULL,
     embedding_blob BLOB,
     min_hit_score REAL,
     topic_slugs TEXT,
     match_post_kinds TEXT,
     expires_at_ms INTEGER,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_probe_subscribers_expires ON probe_subscribers(expires_at_ms)`,
];

export function ensureSwarmHostSqliteSchema(db: Database): void {
  configureSwarmHostSqlitePragmas(db);
  for (const sql of SWARM_HOST_SCHEMA_STATEMENTS) {
    db.run(sql);
  }
}
