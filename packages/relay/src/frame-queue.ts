import type { Database } from "bun:sqlite";

export type FrameQueueRow = { id: number; bytes: Uint8Array };

export type RelayFrameQueue = {
  enqueue(sessionId: string, bytes: Uint8Array): number;
  drainFrom(sessionId: string, afterId: number): FrameQueueRow[];
  deleteMessagesForSession(sessionId: string): void;
};

export function createRelayFrameQueue(db: Database): RelayFrameQueue {
  return {
    enqueue(sessionId: string, bytes: Uint8Array): number {
      const row = db
        .query(
          `INSERT INTO room_messages (session_id, bytes, created_at) VALUES (?, ?, ?) RETURNING id`,
        )
        .get(sessionId, bytes, Date.now()) as { id: number };
      return row.id;
    },

    drainFrom(sessionId: string, afterId: number): FrameQueueRow[] {
      const rows = db
        .query(
          `SELECT id, bytes FROM room_messages WHERE session_id = ? AND id > ? ORDER BY id ASC`,
        )
        .all(sessionId, afterId) as Array<{ id: number; bytes: Uint8Array }>;
      return rows.map((r) => ({ id: r.id, bytes: r.bytes }));
    },

    deleteMessagesForSession(sessionId: string): void {
      db.run(`DELETE FROM room_messages WHERE session_id = ?`, [sessionId]);
    },
  };
}
