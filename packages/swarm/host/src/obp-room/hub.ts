import { generateRoomSecretHex, signRoomTicket, verifyRoomTicket } from "@cfd/frame-channel";
import type { ObpRelayPersistence } from "../persistence/types.ts";
import type { ObpRoomHubPort, ObpRoomPeer } from "./port.ts";

export type CreateObpRoomHubOptions = {
  obpRelay: ObpRelayPersistence;
};

export function createObpRoomHub(options: CreateObpRoomHubOptions): ObpRoomHubPort {
  const { obpRelay } = options;
  const peers = new Map<string, Set<ObpRoomPeer>>();

  const getPeerSet = (roomId: string): Set<ObpRoomPeer> => {
    let s = peers.get(roomId);
    if (s === undefined) {
      s = new Set();
      peers.set(roomId, s);
    }
    return s;
  };

  return {
    async createRoom(roomId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(roomId, secret);
      const now = Date.now();
      obpRelay.upsertRoom({
        roomId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      obpRelay.deleteFramesForRoom(roomId);
      return { ticket };
    },

    async verifyTicket(roomId: string, ticket: string): Promise<boolean> {
      const secret = obpRelay.getPairingSecretIfActive(roomId, Date.now());
      if (secret === undefined) {
        return false;
      }
      return verifyRoomTicket(roomId, ticket, secret);
    },

    async attachPeer(roomId: string, peer: ObpRoomPeer): Promise<void> {
      const set = getPeerSet(roomId);
      set.add(peer);
      const replay = obpRelay.drainFramesAfter(roomId, 0);
      for (const row of replay) {
        peer.send(row.bytes);
      }
    },

    detachPeer(roomId: string, peer: ObpRoomPeer): void {
      const set = peers.get(roomId);
      if (set === undefined) {
        return;
      }
      set.delete(peer);
      if (set.size === 0) {
        peers.delete(roomId);
      }
    },

    relayBytes(roomId: string, from: ObpRoomPeer, bytes: Uint8Array): void {
      obpRelay.enqueueFrame(roomId, bytes);
      const set = peers.get(roomId);
      if (set === undefined) {
        return;
      }
      for (const p of set) {
        if (p !== from) {
          p.send(bytes);
        }
      }
    },
  };
}
