import { describe, expect, test } from "bun:test";
import { mergeAtriumProfilePatch, parseAtriumRegistrationMetadata, zAtriumProfile } from "./atrium-profile.ts";

describe("parseAtriumRegistrationMetadata", () => {
  test("empty metadata", () => {
    expect(parseAtriumRegistrationMetadata(undefined)).toEqual({});
    expect(parseAtriumRegistrationMetadata({})).toEqual({});
  });

  test("display fields", () => {
    expect(
      parseAtriumRegistrationMetadata({ displayName: " Ada ", bio: " hi " }),
    ).toEqual({ displayName: "Ada", bio: "hi" });
  });

  test("strips legacy client ids", () => {
    expect(
      parseAtriumRegistrationMetadata({ profileId: "u1", id: "x", displayName: "N" }),
    ).toEqual({ displayName: "N" });
  });

  test("rejects invalid bounds", () => {
    expect(() =>
      parseAtriumRegistrationMetadata({ displayName: "x".repeat(201) }),
    ).toThrow(/invalid registration metadata/i);
  });
});

describe("mergeAtriumProfilePatch", () => {
  test("updates display fields", () => {
    const prev = zAtriumProfile.parse({ id: "p1", displayName: "A", bio: "old" });
    const next = mergeAtriumProfilePatch(prev, { displayName: "B" });
    expect(next).toEqual({ id: "p1", displayName: "B", bio: "old" });
  });
});
