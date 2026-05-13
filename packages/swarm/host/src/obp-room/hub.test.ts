import { describe, expect, test } from "bun:test";
import type { ObpRelayPersistence, ObpRelayRoomRecord } from "../persistence/types.ts";
import { createObpRoomHub } from "./hub.ts";

function createFakeRelay(): ObpRelayPersistence & { deleteCalls: string[] } {
  const rooms = new Map<string, ObpRelayRoomRecord>();
  const deleteCalls: string[] = [];
  return {
    deleteCalls,
    upsertRoom(record: ObpRelayRoomRecord): void {
      rooms.set(record.roomId, { ...record });
    },
    getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined {
      const r = rooms.get(roomId);
      if (r === undefined || r.expiresAtMs <= nowMs) return undefined;
      return r.pairingSecretHex;
    },
    enqueueFrame(roomId: string, bytes: Uint8Array): number {
      void roomId;
      void bytes;
      return 1;
    },
    drainFramesAfter(): never[] {
      return [];
    },
    deleteFramesForRoom(roomId: string): void {
      deleteCalls.push(roomId);
    },
  };
}

describe("createObpRoomHub", () => {
  test("createRoom clears frames; rotateRoomTicket does not", async () => {
    const relay = createFakeRelay();
    const hub = createObpRoomHub({ obpRelay: relay });
    await hub.createRoom("room-a", 60_000);
    expect(relay.deleteCalls).toEqual(["room-a"]);
    relay.deleteCalls.length = 0;
    await hub.rotateRoomTicket("room-a", 60_000);
    expect(relay.deleteCalls).toEqual([]);
  });

  test("rotateRoomTicket throws when room is missing or expired", async () => {
    const relay = createFakeRelay();
    const hub = createObpRoomHub({ obpRelay: relay });
    await expect(hub.rotateRoomTicket("nope", 60_000)).rejects.toThrow(/no active room/);
    await hub.createRoom("r", 60_000);
    await expect(hub.rotateRoomTicket("r", 60_000)).resolves.toBeDefined();
    await expect(hub.rotateRoomTicket("r", 60_000)).resolves.toBeDefined();
  });
});
