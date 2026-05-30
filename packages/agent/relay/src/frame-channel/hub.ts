import {
  generateRoomSecretHex,
  signRoomTicket,
  verifyRoomTicket,
} from "@khoralabs/duplex-byte-stream";
import { encodeFramedJson, isNegotiationFrameObject } from "@khoralabs/obp-v2-frames-impl";
import type { FrameChannelHubPersistence } from "../persistence/types";
import type { FrameChannelHubPort, FrameChannelPeer } from "./port";

export type CreateFrameChannelHubOptions = {
  hubPersistence: FrameChannelHubPersistence;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isRelayEnvelopeShape(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return "frame" in v && "relay_ts_ms" in v;
}

function relayOutBytesForMessage(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) return bytes;
  try {
    const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
    if (4 + len !== bytes.length) return bytes;
    const text = new TextDecoder().decode(bytes.subarray(4, 4 + len));
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) return bytes;
    if ("init" in value || "session_envelope" in value) return bytes;
    if (isRelayEnvelopeShape(value)) return bytes;
    if (isNegotiationFrameObject(value)) {
      return encodeFramedJson({
        frame: value,
        relay_ts_ms: Date.now(),
      });
    }
  } catch {
    return bytes;
  }
  return bytes;
}

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

    relayBytes(channelId: string, _from: FrameChannelPeer, bytes: Uint8Array): void {
      const out = relayOutBytesForMessage(bytes);
      hubPersistence.enqueueFrame(channelId, out);
      const set = peers.get(channelId);
      if (set === undefined) {
        return;
      }
      for (const p of set) {
        p.send(out);
      }
    },
  };
}
