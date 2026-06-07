import type { Database } from "bun:sqlite";

/** Reference SQLite schema for {@link FrameRelayStoreStrategy}. */
export function ensureFrameRelayStoreSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      channel_id TEXT PRIMARY KEY NOT NULL,
      pairing_secret_hex TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      bytes BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_room_frames_channel_id ON room_frames(channel_id);
  `);
}
