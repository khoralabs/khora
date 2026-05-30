import { describe, expect, test } from "bun:test";
import { generateRoomSecretHex, signRoomTicket, verifyRoomTicket } from "./room-ticket";

describe("room-ticket", () => {
  test("round trip", async () => {
    const secret = generateRoomSecretHex();
    const roomId = "sess-abc-123";
    const ticket = await signRoomTicket(roomId, secret);
    expect(await verifyRoomTicket(roomId, ticket, secret)).toBe(true);
    expect(await verifyRoomTicket("other", ticket, secret)).toBe(false);
  });
});
