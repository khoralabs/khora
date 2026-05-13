import type { Database } from "bun:sqlite";
import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.3.0",
  to: "0.4.0",
  name: "001-atrium-rooms-invitee-index",
  up(db: Database) {
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_atrium_rooms_invitee ON atrium_rooms(invite_target_did, created_at_ms DESC)`,
    );
  },
} satisfies Migration;
