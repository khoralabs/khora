import type { Database } from "bun:sqlite";

/** Bootstrap SQLite tables for relay state (cards, rooms, buffered frames). */
export function ensureRelaySchema(db: Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS cards (
  actor_hex TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  relay_endpoint TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

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
`);
}
