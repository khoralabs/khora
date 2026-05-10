import type { Database } from "bun:sqlite";
import type { ObpRelayFrameRow, ObpRelayPersistence, ObpRelayRoomRecord } from "../types.ts";

export function createObpRelaySqlitePersistence(db: Database): ObpRelayPersistence {
  return {
    upsertRoom(record: ObpRelayRoomRecord): void {
      db.run(
        `INSERT INTO rooms (session_id, pairing_secret_hex, created_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           pairing_secret_hex = excluded.pairing_secret_hex,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
        [record.roomId, record.pairingSecretHex, record.createdAtMs, record.expiresAtMs],
      );
    },

    getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined {
      const row = db
        .query(`SELECT pairing_secret_hex FROM rooms WHERE session_id = ? AND expires_at > ?`)
        .get(roomId, nowMs) as { pairing_secret_hex: string } | undefined;
      return row?.pairing_secret_hex;
    },

    enqueueFrame(roomId: string, bytes: Uint8Array): number {
      const row = db
        .query(
          `INSERT INTO room_messages (session_id, bytes, created_at) VALUES (?, ?, ?) RETURNING id`,
        )
        .get(roomId, bytes, Date.now()) as { id: number };
      return row.id;
    },

    drainFramesAfter(roomId: string, afterId: number): ObpRelayFrameRow[] {
      const rows = db
        .query(
          `SELECT id, bytes FROM room_messages WHERE session_id = ? AND id > ? ORDER BY id ASC`,
        )
        .all(roomId, afterId) as Array<{ id: number; bytes: Uint8Array }>;
      return rows.map((r) => ({ id: r.id, bytes: r.bytes }));
    },

    deleteFramesForRoom(roomId: string): void {
      db.run(`DELETE FROM room_messages WHERE session_id = ?`, [roomId]);
    },
  };
}
