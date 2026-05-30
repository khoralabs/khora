import { describe, expect, test } from "bun:test";
import { createMemoryDuplexByteStreamPair } from "@khoralabs/duplex-byte-stream";
import { encodeFramedJson } from "@khoralabs/obp-v2-frames-impl";
import type { FrameChannelHubPersistence, FrameChannelRoomRecord } from "../persistence/types";
import { attachDuplexAsFrameChannelPeer } from "./duplex-peer";
import { createFrameChannelHub } from "./hub";

function createFakeHubPersistence(): FrameChannelHubPersistence & { deleteCalls: string[] } {
  const rooms = new Map<string, FrameChannelRoomRecord>();
  const frames = new Map<string, Array<{ id: number; bytes: Uint8Array }>>();
  let seq = 0;
  const deleteCalls: string[] = [];

  return {
    deleteCalls,
    upsertRoom(record: FrameChannelRoomRecord): void {
      rooms.set(record.channelId, record);
    },
    getPairingSecretIfActive(channelId: string, nowMs: number): string | undefined {
      const r = rooms.get(channelId);
      if (r === undefined || r.expiresAtMs <= nowMs) return undefined;
      return r.pairingSecretHex;
    },
    enqueueFrame(channelId: string, bytes: Uint8Array): number {
      const id = ++seq;
      let q = frames.get(channelId);
      if (q === undefined) {
        q = [];
        frames.set(channelId, q);
      }
      q.push({ id, bytes });
      return id;
    },
    drainFramesAfter(channelId: string, afterId: number) {
      const q = frames.get(channelId);
      if (q === undefined) return [];
      return q.filter((f) => f.id > afterId);
    },
    deleteFramesForRoom(channelId: string): void {
      deleteCalls.push(channelId);
      frames.delete(channelId);
    },
  };
}

describe("attachDuplexAsFrameChannelPeer", () => {
  test("inbound duplex bytes are relayed to other peers", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-a");

    const [clientSide, serverSide] = createMemoryDuplexByteStreamPair();
    await attachDuplexAsFrameChannelPeer(hub, "room-a", serverSide);

    const received: Uint8Array[] = [];
    await hub.attachPeer("room-a", {
      send(b) {
        received.push(b);
      },
    });

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {},
    };
    const raw = encodeFramedJson(frame);
    await clientSide.write(raw);

    for (let i = 0; i < 50 && received.length === 0; i++) {
      await new Promise<void>((r) => queueMicrotask(r));
    }

    expect(received.length).toBeGreaterThanOrEqual(1);

    await clientSide.close();
  });

  test("dispose closes duplex", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-x");

    const [clientSide, serverSide] = createMemoryDuplexByteStreamPair();
    const { dispose } = await attachDuplexAsFrameChannelPeer(hub, "room-x", serverSide);
    await dispose();
    await clientSide.close();
  });
});
