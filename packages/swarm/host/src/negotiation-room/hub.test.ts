import { describe, expect, test } from "bun:test";
import type {
  NegotiationRelayPersistence,
  NegotiationRelayRoomRecord,
} from "../persistence/types.ts";
import { createNegotiationRoomHub } from "./hub.ts";

function createFakeRelay(): NegotiationRelayPersistence & { deleteCalls: string[] } {
  const rooms = new Map<string, NegotiationRelayRoomRecord>();
  const frames = new Map<string, Array<{ id: number; bytes: Uint8Array }>>();
  let nextId = 1;
  const deleteCalls: string[] = [];

  return {
    deleteCalls,
    upsertRoom(record: NegotiationRelayRoomRecord): void {
      rooms.set(record.roomId, record);
    },
    getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined {
      const r = rooms.get(roomId);
      if (r === undefined || r.expiresAtMs <= nowMs) return undefined;
      return r.pairingSecretHex;
    },
    enqueueFrame(roomId: string, bytes: Uint8Array): number {
      const list = frames.get(roomId) ?? [];
      const id = nextId++;
      list.push({ id, bytes });
      frames.set(roomId, list);
      return id;
    },
    drainFramesAfter(roomId: string, afterId: number): Array<{ id: number; bytes: Uint8Array }> {
      const list = frames.get(roomId) ?? [];
      return list.filter((f) => f.id > afterId);
    },
    deleteFramesForRoom(roomId: string): void {
      deleteCalls.push(roomId);
      frames.delete(roomId);
    },
  };
}

describe("createNegotiationRoomHub", () => {
  test("createRoom clears prior frames", async () => {
    const relay = createFakeRelay();
    relay.enqueueFrame("r1", new Uint8Array([1]));
    const hub = createNegotiationRoomHub({ negotiationRelay: relay });
    await hub.createRoom("r1");
    expect(relay.deleteCalls).toContain("r1");
  });

  test("relayBytes fans out to other peers", async () => {
    const relay = createFakeRelay();
    const hub = createNegotiationRoomHub({ negotiationRelay: relay });
    await hub.createRoom("room-a");
    const sent: Uint8Array[] = [];
    const p1: import("./port.ts").NegotiationRoomPeer = {
      send(b) {
        sent.push(b);
      },
    };
    const p2: import("./port.ts").NegotiationRoomPeer = {
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
