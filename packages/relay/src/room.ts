import type { Database } from "bun:sqlite";
import { generateRoomSecretHex, signRoomTicket, verifyRoomTicket } from "@cfd/frame-channel";
import type { ServerWebSocket } from "bun";
import type { RelayFrameQueue } from "./frame-queue.ts";
import type { RelayWsData } from "./relay-ws-data.ts";

export type RelayRoomHub = {
  createRoom(sessionId: string, ttlMs?: number): Promise<{ ticket: string }>;
  verifyTicket(sessionId: string, ticket: string): Promise<boolean>;
  /** After ticket verified: replay buffered frames and register live relay. */
  attachPeer(sessionId: string, ws: ServerWebSocket<RelayWsData>): Promise<void>;
  detachPeer(sessionId: string, ws: ServerWebSocket<RelayWsData>): void;
  relayBytes(sessionId: string, from: ServerWebSocket<RelayWsData>, bytes: Uint8Array): void;
};

export function createRelayRoomHub(options: {
  db: Database;
  frameQueue: RelayFrameQueue;
}): RelayRoomHub {
  const { db, frameQueue } = options;
  const peers = new Map<string, Set<ServerWebSocket<RelayWsData>>>();

  const getPeerSet = (sessionId: string): Set<ServerWebSocket<RelayWsData>> => {
    let s = peers.get(sessionId);
    if (s === undefined) {
      s = new Set();
      peers.set(sessionId, s);
    }
    return s;
  };

  return {
    async createRoom(sessionId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(sessionId, secret);
      const now = Date.now();
      db.run(
        `INSERT INTO rooms (session_id, pairing_secret_hex, created_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           pairing_secret_hex = excluded.pairing_secret_hex,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
        [sessionId, secret, now, now + ttlMs],
      );
      frameQueue.deleteMessagesForSession(sessionId);
      return { ticket };
    },

    async verifyTicket(sessionId: string, ticket: string): Promise<boolean> {
      const now = Date.now();
      const row = db
        .query(`SELECT pairing_secret_hex FROM rooms WHERE session_id = ? AND expires_at > ?`)
        .get(sessionId, now) as { pairing_secret_hex: string } | undefined;
      if (row === undefined) {
        return false;
      }
      return verifyRoomTicket(sessionId, ticket, row.pairing_secret_hex);
    },

    async attachPeer(sessionId: string, ws: ServerWebSocket<RelayWsData>): Promise<void> {
      const set = getPeerSet(sessionId);
      set.add(ws);
      const replay = frameQueue.drainFrom(sessionId, 0);
      for (const row of replay) {
        ws.send(row.bytes);
      }
    },

    detachPeer(sessionId: string, ws: ServerWebSocket<RelayWsData>): void {
      const set = peers.get(sessionId);
      if (set === undefined) {
        return;
      }
      set.delete(ws);
      if (set.size === 0) {
        peers.delete(sessionId);
      }
    },

    relayBytes(sessionId: string, from: ServerWebSocket<RelayWsData>, bytes: Uint8Array): void {
      frameQueue.enqueue(sessionId, bytes);
      const set = peers.get(sessionId);
      if (set === undefined) {
        return;
      }
      for (const peer of set) {
        if (peer !== from) {
          peer.send(bytes);
        }
      }
    },
  };
}
