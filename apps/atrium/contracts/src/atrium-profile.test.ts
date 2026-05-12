import { describe, expect, test } from "bun:test";
import {
  atriumProfileLexicalText,
  mergeAtriumProfilePatch,
  parseAtriumRegistrationMetadata,
  zAtriumProfile,
} from "./atrium-profile.ts";

describe("parseAtriumRegistrationMetadata", () => {
  test("requires username", () => {
    expect(() => parseAtriumRegistrationMetadata(undefined)).toThrow(
      /invalid registration metadata/i,
    );
    expect(() => parseAtriumRegistrationMetadata({})).toThrow(/invalid registration metadata/i);
  });

  test("normalizes username + trims display fields", () => {
    expect(
      parseAtriumRegistrationMetadata({ username: " Ada-99 ", displayName: " Ada ", bio: " hi " }),
    ).toEqual({
      username: "ada-99",
      displayName: "Ada",
      bio: "hi",
    });
  });

  test("strips legacy client ids", () => {
    expect(
      parseAtriumRegistrationMetadata({
        profileId: "u1",
        id: "x",
        username: "alice",
        displayName: "N",
      }),
    ).toEqual({ username: "alice", displayName: "N" });
  });

  test("rejects invalid bounds", () => {
    expect(() =>
      parseAtriumRegistrationMetadata({ username: "u", displayName: "x".repeat(201) }),
    ).toThrow(/invalid registration metadata/i);
  });

  test("rejects invalid username", () => {
    expect(() => parseAtriumRegistrationMetadata({ username: "a--b" })).toThrow(
      /invalid registration metadata/i,
    );
  });
});

describe("mergeAtriumProfilePatch", () => {
  test("updates display fields", () => {
    const prev = zAtriumProfile.parse({ id: "p1", username: "ada", displayName: "A", bio: "old" });
    const next = mergeAtriumProfilePatch(prev, { displayName: "B" });
    expect(next).toEqual({ id: "p1", username: "ada", displayName: "B", bio: "old" });
  });

  test("renames username (normalized)", () => {
    const prev = zAtriumProfile.parse({ id: "p1", username: "ada", bio: "x" });
    const next = mergeAtriumProfilePatch(prev, { username: "Ada-99" });
    expect(next.username).toBe("ada-99");
    expect(next.bio).toBe("x");
  });
});

describe("atriumProfileLexicalText", () => {
  test("includes username", () => {
    const p = zAtriumProfile.parse({ id: "p1", username: "ada", displayName: "Ada", bio: "hi" });
    expect(atriumProfileLexicalText(p)).toContain("ada");
    expect(atriumProfileLexicalText(p)).toContain("Ada");
    expect(atriumProfileLexicalText(p)).toContain("hi");
  });
});

describe("zAtriumProfile", () => {
  test("requires username", () => {
    expect(() => zAtriumProfile.parse({ id: "p1" })).toThrow();
  });

  test("normalizes username on parse", () => {
    const p = zAtriumProfile.parse({ id: "p1", username: " Alice-99 " });
    expect(p.username).toBe("alice-99");
  });
});
