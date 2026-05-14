import { describe, expect, test } from "bun:test";
import type { FrameChannelHubPersistence, FrameChannelRoomRecord } from "../persistence/types.ts";
import { createFrameChannelHub } from "./hub.ts";

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

  test("relayBytes fans out to other peers", async () => {
    const persistence = createFakeHubPersistence();
    const hub = createFrameChannelHub({ hubPersistence: persistence });
    await hub.createChannel("room-a");

    const sent: Uint8Array[] = [];
    const p1: import("./port.ts").FrameChannelPeer = {
      send(_b) {},
    };
    const p2: import("./port.ts").FrameChannelPeer = {
      send(b) {
        sent.push(b);
      },
    };
    await hub.attachPeer("room-a", p1);
    await hub.attachPeer("room-a", p2);
    hub.relayBytes("room-a", p1, new Uint8Array([9]));
    expect(sent.length).toBe(1);
    expect(sent[0]?.[0]).toBe(9);
  });
});
