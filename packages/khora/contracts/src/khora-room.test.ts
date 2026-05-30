import { describe, expect, test } from "bun:test";
import {
  zKhoraRoomCreateBody,
  zKhoraRoomJoinTicketResponse,
  zKhoraRoomListResponse,
  zKhoraRoomTicketResponse,
} from "./khora-room";

describe("khora-room contracts", () => {
  test("zKhoraRoomCreateBody accepts optional fields", () => {
    const a = zKhoraRoomCreateBody.parse({ targetUsername: "ada" });
    expect(a.targetUsername).toBe("ada");
  });

  test("zKhoraRoomCreateBody rejects client roomId", () => {
    expect(() => zKhoraRoomCreateBody.parse({ roomId: "nope" })).toThrow();
  });

  test("zKhoraRoomTicketResponse", () => {
    const r = zKhoraRoomTicketResponse.parse({
      roomId: "r1",
      ticket: "t",
      webSocketUrl: "ws://localhost/v1/khora/rooms/r1/ws?ticket=t",
    });
    expect(r.roomId).toBe("r1");
  });

  test("zKhoraRoomJoinTicketResponse requires creatorDid", () => {
    const r = zKhoraRoomJoinTicketResponse.parse({
      roomId: "r1",
      ticket: "t",
      webSocketUrl: "ws://localhost/ws?ticket=t",
      creatorDid: "did:key:creator",
    });
    expect(r.creatorDid).toBe("did:key:creator");
  });

  test("zKhoraRoomListResponse", () => {
    const r = zKhoraRoomListResponse.parse({
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
