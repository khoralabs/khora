import { generateRoomSecretHex, signRoomTicket, verifyRoomTicket } from "@khoralabs/frame-channel";
import type { NegotiationRelayPersistence } from "../persistence/types.ts";
import type { NegotiationRoomHubPort, NegotiationRoomPeer } from "./port.ts";

export type CreateNegotiationRoomHubOptions = {
  negotiationRelay: NegotiationRelayPersistence;
};

export function createNegotiationRoomHub(
  options: CreateNegotiationRoomHubOptions,
): NegotiationRoomHubPort {
  const { negotiationRelay } = options;
  const peers = new Map<string, Set<NegotiationRoomPeer>>();

  const getPeerSet = (roomId: string): Set<NegotiationRoomPeer> => {
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
      negotiationRelay.upsertRoom({
        roomId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      negotiationRelay.deleteFramesForRoom(roomId);
      return { ticket };
    },

    async rotateRoomTicket(roomId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const prior = negotiationRelay.getPairingSecretIfActive(roomId, Date.now());
      if (prior === undefined) {
        throw new Error(`NegotiationRoomHub: no active room to rotate ticket for: ${roomId}`);
      }
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(roomId, secret);
      const now = Date.now();
      negotiationRelay.upsertRoom({
        roomId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      return { ticket };
    },

    async verifyTicket(roomId: string, ticket: string): Promise<boolean> {
      const secret = negotiationRelay.getPairingSecretIfActive(roomId, Date.now());
      if (secret === undefined) {
        return false;
      }
      return verifyRoomTicket(roomId, ticket, secret);
    },

    async attachPeer(roomId: string, peer: NegotiationRoomPeer): Promise<void> {
      const set = getPeerSet(roomId);
      set.add(peer);
      const replay = negotiationRelay.drainFramesAfter(roomId, 0);
      for (const row of replay) {
        peer.send(row.bytes);
      }
    },

    detachPeer(roomId: string, peer: NegotiationRoomPeer): void {
      const set = peers.get(roomId);
      if (set === undefined) {
        return;
      }
      set.delete(peer);
      if (set.size === 0) {
        peers.delete(roomId);
      }
    },

    relayBytes(roomId: string, from: NegotiationRoomPeer, bytes: Uint8Array): void {
      negotiationRelay.enqueueFrame(roomId, bytes);
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
