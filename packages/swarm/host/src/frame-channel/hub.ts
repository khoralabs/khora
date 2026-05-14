import {
  generateRoomSecretHex,
  signRoomTicket,
  verifyRoomTicket,
} from "@khoralabs/duplex-byte-stream";
import type { FrameChannelHubPersistence } from "../persistence/types.ts";
import type { FrameChannelHubPort, FrameChannelPeer } from "./port.ts";

export type CreateFrameChannelHubOptions = {
  hubPersistence: FrameChannelHubPersistence;
};

export function createFrameChannelHub(options: CreateFrameChannelHubOptions): FrameChannelHubPort {
  const { hubPersistence } = options;
  const peers = new Map<string, Set<FrameChannelPeer>>();

  const getPeerSet = (channelId: string): Set<FrameChannelPeer> => {
    let s = peers.get(channelId);
    if (s === undefined) {
      s = new Set();
      peers.set(channelId, s);
    }
    return s;
  };

  return {
    async createChannel(channelId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(channelId, secret);
      const now = Date.now();
      hubPersistence.upsertRoom({
        channelId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      hubPersistence.deleteFramesForRoom(channelId);
      return { ticket };
    },

    async rotateChannelTicket(channelId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const prior = hubPersistence.getPairingSecretIfActive(channelId, Date.now());
      if (prior === undefined) {
        throw new Error(`FrameChannelHub: no active room to rotate ticket for: ${channelId}`);
      }
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(channelId, secret);
      const now = Date.now();
      hubPersistence.upsertRoom({
        channelId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      return { ticket };
    },

    async verifyTicket(channelId: string, ticket: string): Promise<boolean> {
      const secret = hubPersistence.getPairingSecretIfActive(channelId, Date.now());
      if (secret === undefined) {
        return false;
      }
      return verifyRoomTicket(channelId, ticket, secret);
    },

    async attachPeer(channelId: string, peer: FrameChannelPeer): Promise<void> {
      const set = getPeerSet(channelId);
      set.add(peer);
      const replay = hubPersistence.drainFramesAfter(channelId, 0);
      for (const row of replay) {
        peer.send(row.bytes);
      }
    },

    detachPeer(channelId: string, peer: FrameChannelPeer): void {
      const set = peers.get(channelId);
      if (set === undefined) {
        return;
      }
      set.delete(peer);
      if (set.size === 0) {
        peers.delete(channelId);
      }
    },

    relayBytes(channelId: string, from: FrameChannelPeer, bytes: Uint8Array): void {
      hubPersistence.enqueueFrame(channelId, bytes);
      const set = peers.get(channelId);
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
