import type { Database } from "bun:sqlite";
import type {
  FrameChannelHubPersistence,
  FrameChannelRoomRecord,
  FrameChannelStoredFrame,
} from "@khoralabs/agent-relay";

function ensureFrameChannelSchema(db: Database): void {
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

export function createFrameChannelHubPersistenceSqlite(db: Database): FrameChannelHubPersistence {
  ensureFrameChannelSchema(db);
  const upsertRoomStmt = db.prepare(
    `INSERT INTO rooms (channel_id, pairing_secret_hex, created_at_ms, expires_at_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET
       pairing_secret_hex = excluded.pairing_secret_hex,
       created_at_ms = excluded.created_at_ms,
       expires_at_ms = excluded.expires_at_ms`,
  );
  const selectPairingSecret = db.query(
    `SELECT pairing_secret_hex FROM rooms WHERE channel_id = ? AND expires_at_ms > ?`,
  );
  const enqueueFrameStmt = db.query(
    `INSERT INTO room_frames (channel_id, bytes) VALUES (?, ?) RETURNING id`,
  );
  const selectFramesAfter = db.query(
    `SELECT id, bytes FROM room_frames WHERE channel_id = ? AND id > ? ORDER BY id ASC`,
  );
  const deleteFramesForRoomStmt = db.prepare(`DELETE FROM room_frames WHERE channel_id = ?`);

  return {
    upsertRoom(record: FrameChannelRoomRecord): void {
      upsertRoomStmt.run(
        record.channelId,
        record.pairingSecretHex,
        record.createdAtMs,
        record.expiresAtMs,
      );
    },

    getPairingSecretIfActive(channelId: string, nowMs: number): string | undefined {
      const row = selectPairingSecret.get(channelId, nowMs) as
        | { pairing_secret_hex: string }
        | undefined;
      return row?.pairing_secret_hex;
    },

    enqueueFrame(channelId: string, bytes: Uint8Array): number {
      const row = enqueueFrameStmt.get(channelId, bytes) as { id: number };
      return row.id;
    },

    drainFramesAfter(channelId: string, afterId: number): FrameChannelStoredFrame[] {
      const rows = selectFramesAfter.all(channelId, afterId) as Array<{
        id: number;
        bytes: Uint8Array;
      }>;
      return rows.map((r) => ({ id: r.id, bytes: r.bytes }));
    },

    deleteFramesForRoom(channelId: string): void {
      deleteFramesForRoomStmt.run(channelId);
    },
  };
}
