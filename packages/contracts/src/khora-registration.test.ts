import { describe, expect, test } from "bun:test";
import { zKhoraRegisterResult, zKhoraRegistrationRequestBody } from "./khora-registration";

describe("khora registration contracts", () => {
  test("zKhoraRegistrationRequestBody accepts inviteToken", () => {
    const x = zKhoraRegistrationRequestBody.parse({
      did: "did:key:x",
      metadata: { displayName: "A" },
      inviteToken: "abc",
    });
    expect(x.inviteToken).toBe("abc");
  });

  test("zKhoraRegisterResult optional inviteTokens", () => {
    const a = zKhoraRegisterResult.parse({
      did: "did:key:x",
      profileId: "p1",
      profile: { id: "p1", username: "alice" },
    });
    expect(a.inviteTokens).toBeUndefined();
    const b = zKhoraRegisterResult.parse({
      did: "did:key:x",
      profileId: "p1",
      profile: { id: "p1", username: "alice" },
      inviteTokens: ["t1", "t2"],
    });
    expect(b.inviteTokens).toEqual(["t1", "t2"]);
  });
});
