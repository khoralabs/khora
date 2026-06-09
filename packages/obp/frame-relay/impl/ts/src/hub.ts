import {
  generateRoomSecretHex,
  signRoomTicket,
  verifyRoomTicket,
} from "@khoralabs/duplex-byte-stream";
import type { FrameRelayHubPort, FrameRelayPeer } from "./hub-port";
import { relayOutBytesForMessage } from "./relay-envelope";
import type { FrameRelayStoreStrategy } from "./store-types";

export type CreateFrameRelayHubOptions = {
  store: FrameRelayStoreStrategy;
};

export function createFrameRelayHub(options: CreateFrameRelayHubOptions): FrameRelayHubPort {
  const { store } = options;
  const peers = new Map<string, Set<FrameRelayPeer>>();

  const getPeerSet = (channelId: string): Set<FrameRelayPeer> => {
    let set = peers.get(channelId);
    if (set === undefined) {
      set = new Set();
      peers.set(channelId, set);
    }
    return set;
  };

  return {
    async createChannel(channelId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(channelId, secret);
      const now = Date.now();
      store.upsertChannelAdmission({
        channelId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      store.purgeRelayedFramesForChannel(channelId);
      return { ticket };
    },

    async mintChannelTicket(channelId: string): Promise<{ ticket: string } | undefined> {
      const secret = store.getPairingSecretIfActive(channelId, Date.now());
      if (secret === undefined) {
        return undefined;
      }
      const ticket = await signRoomTicket(channelId, secret);
      return { ticket };
    },

    async rotateChannelTicket(channelId: string, ttlMs = 86_400_000): Promise<{ ticket: string }> {
      const prior = store.getPairingSecretIfActive(channelId, Date.now());
      if (prior === undefined) {
        throw new Error(`FrameRelayHub: no active channel to rotate ticket for: ${channelId}`);
      }
      const secret = generateRoomSecretHex();
      const ticket = await signRoomTicket(channelId, secret);
      const now = Date.now();
      store.upsertChannelAdmission({
        channelId,
        pairingSecretHex: secret,
        createdAtMs: now,
        expiresAtMs: now + ttlMs,
      });
      return { ticket };
    },

    async verifyTicket(channelId: string, ticket: string): Promise<boolean> {
      const secret = store.getPairingSecretIfActive(channelId, Date.now());
      if (secret === undefined) {
        return false;
      }
      return verifyRoomTicket(channelId, ticket, secret);
    },

    async attachPeer(channelId: string, peer: FrameRelayPeer): Promise<void> {
      const set = getPeerSet(channelId);
      set.add(peer);
      const replay = store.listRelayedFramesAfter(channelId, 0);
      for (const row of replay) {
        peer.send(row.bytes);
      }
    },

    detachPeer(channelId: string, peer: FrameRelayPeer): void {
      const set = peers.get(channelId);
      if (set === undefined) {
        return;
      }
      set.delete(peer);
      if (set.size === 0) {
        peers.delete(channelId);
      }
    },

    relayBytes(channelId: string, _from: FrameRelayPeer, bytes: Uint8Array): void {
      const out = relayOutBytesForMessage(bytes);
      store.enqueueRelayedFrame(channelId, out);
      const set = peers.get(channelId);
      if (set === undefined) {
        return;
      }
      for (const peer of set) {
        peer.send(out);
      }
    },
  };
}
