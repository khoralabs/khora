import type { Database } from "bun:sqlite";
import type {
  FrameChannelHubPersistence,
  FrameChannelRoomRecord,
  FrameChannelStoredFrame,
} from "@khoralabs/swarm-host";

export function createFrameChannelHubPersistenceSqlite(db: Database): FrameChannelHubPersistence {
  const upsertRoomStmt = db.prepare(
    `INSERT INTO rooms (session_id, pairing_secret_hex, created_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       pairing_secret_hex = excluded.pairing_secret_hex,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
  );
  const selectPairingSecret = db.query(
    `SELECT pairing_secret_hex FROM rooms WHERE session_id = ? AND expires_at > ?`,
  );
  const enqueueFrameStmt = db.query(
    `INSERT INTO room_messages (session_id, bytes, created_at) VALUES (?, ?, ?) RETURNING id`,
  );
  const selectFramesAfter = db.query(
    `SELECT id, bytes FROM room_messages WHERE session_id = ? AND id > ? ORDER BY id ASC`,
  );
  const deleteFramesForRoomStmt = db.prepare(`DELETE FROM room_messages WHERE session_id = ?`);

  return {
    upsertRoom(record: FrameChannelRoomRecord): void {
      upsertRoomStmt.run(
        record.channelId,
        record.pairingSecretHex,
        record.createdAtMs,
        record.expiresAtMs,
      );
    },

    getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined {
      const row = selectPairingSecret.get(roomId, nowMs) as
        | { pairing_secret_hex: string }
        | undefined;
      return row?.pairing_secret_hex;
    },

    enqueueFrame(roomId: string, bytes: Uint8Array): number {
      const row = enqueueFrameStmt.get(roomId, bytes, Date.now()) as { id: number };
      return row.id;
    },

    drainFramesAfter(roomId: string, afterId: number): FrameChannelStoredFrame[] {
      const rows = selectFramesAfter.all(roomId, afterId) as Array<{
        id: number;
        bytes: Uint8Array;
      }>;
      return rows.map((r) => ({ id: r.id, bytes: r.bytes }));
    },

    deleteFramesForRoom(roomId: string): void {
      deleteFramesForRoomStmt.run(roomId);
    },
  };
}
