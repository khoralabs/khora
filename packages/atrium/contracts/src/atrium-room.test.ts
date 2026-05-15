import { describe, expect, test } from "bun:test";
import {
  zAtriumRoomCreateBody,
  zAtriumRoomListResponse,
  zAtriumRoomTicketResponse,
} from "./atrium-room.ts";

describe("atrium-room contracts", () => {
  test("zAtriumRoomCreateBody accepts optional fields", () => {
    const a = zAtriumRoomCreateBody.parse({ targetUsername: "ada" });
    expect(a.targetUsername).toBe("ada");
  });

  test("zAtriumRoomCreateBody rejects client roomId", () => {
    expect(() => zAtriumRoomCreateBody.parse({ roomId: "nope" })).toThrow();
  });

  test("zAtriumRoomTicketResponse", () => {
    const r = zAtriumRoomTicketResponse.parse({
      roomId: "r1",
      ticket: "t",
      webSocketUrl: "ws://localhost/v1/atrium/rooms/r1/ws?ticket=t",
    });
    expect(r.roomId).toBe("r1");
  });

  test("zAtriumRoomListResponse", () => {
    const r = zAtriumRoomListResponse.parse({
      rooms: [
        {
          roomId: "a",
          role: "creator",
          createdAtMs: 1,
          expiresAtMs: 2,
          counterpartDid: "did:key:x",
          inviteTargetDid: "did:key:x",
        },
      ],
    });
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0]?.role).toBe("creator");
  });
});
