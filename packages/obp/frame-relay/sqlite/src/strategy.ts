import type { Database } from "bun:sqlite";
import type {
  ChannelAdmissionRecord,
  FrameRelayStoreStrategy,
  RelayedFrameRecord,
} from "@khoralabs/obp-frame-relay";
import { ensureFrameRelayStoreSchema } from "./schema";

export function createSqliteFrameRelayStoreStrategy(db: Database): FrameRelayStoreStrategy {
  ensureFrameRelayStoreSchema(db);
  const upsertAdmissionStmt = db.prepare(
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
  const purgeFramesStmt = db.prepare(`DELETE FROM room_frames WHERE channel_id = ?`);
  const deleteAdmissionStmt = db.prepare(`DELETE FROM rooms WHERE channel_id = ?`);

  return {
    upsertChannelAdmission(record: ChannelAdmissionRecord): void {
      upsertAdmissionStmt.run(
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

    enqueueRelayedFrame(channelId: string, bytes: Uint8Array): number {
      const row = enqueueFrameStmt.get(channelId, bytes) as { id: number };
      return row.id;
    },

    listRelayedFramesAfter(channelId: string, afterId: number): RelayedFrameRecord[] {
      const rows = selectFramesAfter.all(channelId, afterId) as Array<{
        id: number;
        bytes: Uint8Array;
      }>;
      return rows.map((r) => ({ id: r.id, bytes: r.bytes }));
    },

    purgeRelayedFramesForChannel(channelId: string): void {
      purgeFramesStmt.run(channelId);
    },

    deleteChannelAdmission(channelId: string): void {
      deleteAdmissionStmt.run(channelId);
    },
  };
}
