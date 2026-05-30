import { describe, expect, test } from "bun:test";
import { encodeFramedJson } from "@khoralabs/obp-v2-frames-impl";
import type { FrameChannelHubPersistence, FrameChannelRoomRecord } from "../persistence/types";
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

describe("createFrameChannelHub", () => {
  test("createChannel clears prior frames", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-a");
    expect(persistence.deleteCalls).toContain("room-a");
  });

  test("relayBytes echoes wrapped frame to every peer including sender", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-a");

    const received: Uint8Array[] = [];
    const p1: import("./port.ts").FrameChannelPeer = {
      send(b) {
        received.push(b);
      },
    };
    const p2: import("./port.ts").FrameChannelPeer = {
      send(b) {
        received.push(b);
      },
    };
    await hub.attachPeer("room-a", p1);
    await hub.attachPeer("room-a", p2);

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {},
    };
    const raw = encodeFramedJson(frame);
    hub.relayBytes("room-a", p1, raw);

    expect(received.length).toBe(2);
    for (const b of received) {
      const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, false);
      expect(4 + len).toBe(b.length);
      const json = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + len))) as {
        frame: unknown;
        relay_ts_ms: number;
      };
      expect(json.relay_ts_ms).toEqual(expect.any(Number));
      expect((json.frame as { type: string }).type).toBe("TURN");
    }
  });

  test("relayBytes wraps TURN with E2EE ciphertext body", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-a");

    const received: Uint8Array[] = [];
    const p1: import("./port.ts").FrameChannelPeer = {
      send(b) {
        received.push(b);
      },
    };
    await hub.attachPeer("room-a", p1);

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {
        e2ee: { v: 1, alg: "A256GCM", iv: "AAAA", ct: "BBBB" },
      },
    };
    const raw = encodeFramedJson(frame);
    hub.relayBytes("room-a", p1, raw);

    expect(received.length).toBe(1);
    const json = JSON.parse(
      new TextDecoder().decode(received[0]?.subarray(4, 4 + received[0]?.length - 4)),
    ) as { frame: { body: { e2ee: { ct: string } } } };
    expect(json.frame.body.e2ee.ct).toBe("BBBB");
  });
});
