import { describe, expect, test } from "bun:test";
import { zAtriumRegisterResult, zAtriumRegistrationRequestBody } from "./atrium-registration.ts";

describe("atrium registration contracts", () => {
  test("zAtriumRegistrationRequestBody accepts inviteToken", () => {
    const x = zAtriumRegistrationRequestBody.parse({
      did: "did:key:x",
      metadata: { displayName: "A" },
      inviteToken: "abc",
    });
    expect(x.inviteToken).toBe("abc");
  });

  test("zAtriumRegisterResult optional inviteTokens", () => {
    const a = zAtriumRegisterResult.parse({
      did: "did:key:x",
      profileId: "p1",
      profile: { id: "p1" },
    });
    expect(a.inviteTokens).toBeUndefined();
    const b = zAtriumRegisterResult.parse({
      did: "did:key:x",
      profileId: "p1",
      profile: { id: "p1" },
      inviteTokens: ["t1", "t2"],
    });
    expect(b.inviteTokens).toEqual(["t1", "t2"]);
  });
});
