import type { Database } from "bun:sqlite";
import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.2.0",
  to: "0.3.0",
  name: "001-atrium-rooms",
  up(db: Database) {
    db.run(`CREATE TABLE IF NOT EXISTS atrium_rooms (
      room_id TEXT PRIMARY KEY NOT NULL,
      created_by_profile_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      invite_target_did TEXT,
      expires_at_ms INTEGER
    )`);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_atrium_rooms_creator ON atrium_rooms(created_by_profile_id, created_at_ms DESC)`,
    );
  },
} satisfies Migration;
