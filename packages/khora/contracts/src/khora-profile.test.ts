import { describe, expect, test } from "bun:test";
import {
  khoraProfileLexicalText,
  mergeKhoraProfilePatch,
  parseKhoraRegistrationMetadata,
  zKhoraProfile,
} from "./khora-profile.ts";

describe("parseKhoraRegistrationMetadata", () => {
  test("requires username", () => {
    expect(() => parseKhoraRegistrationMetadata(undefined)).toThrow(
      /invalid registration metadata/i,
    );
    expect(() => parseKhoraRegistrationMetadata({})).toThrow(/invalid registration metadata/i);
  });

  test("normalizes username + trims display fields", () => {
    expect(
      parseKhoraRegistrationMetadata({ username: " Ada-99 ", displayName: " Ada ", bio: " hi " }),
    ).toEqual({
      username: "ada-99",
      displayName: "Ada",
      bio: "hi",
    });
  });

  test("strips legacy client ids", () => {
    expect(
      parseKhoraRegistrationMetadata({
        profileId: "u1",
        id: "x",
        username: "alice",
        displayName: "N",
      }),
    ).toEqual({ username: "alice", displayName: "N" });
  });

  test("rejects invalid bounds", () => {
    expect(() =>
      parseKhoraRegistrationMetadata({ username: "u", displayName: "x".repeat(201) }),
    ).toThrow(/invalid registration metadata/i);
  });

  test("rejects invalid username", () => {
    expect(() => parseKhoraRegistrationMetadata({ username: "a--b" })).toThrow(
      /invalid registration metadata/i,
    );
  });
});

describe("mergeKhoraProfilePatch", () => {
  test("updates display fields", () => {
    const prev = zKhoraProfile.parse({ id: "p1", username: "ada", displayName: "A", bio: "old" });
    const next = mergeKhoraProfilePatch(prev, { displayName: "B" });
    expect(next).toEqual({ id: "p1", username: "ada", displayName: "B", bio: "old" });
  });

  test("renames username (normalized)", () => {
    const prev = zKhoraProfile.parse({ id: "p1", username: "ada", bio: "x" });
    const next = mergeKhoraProfilePatch(prev, { username: "Ada-99" });
    expect(next.username).toBe("ada-99");
    expect(next.bio).toBe("x");
  });
});

describe("khoraProfileLexicalText", () => {
  test("includes username", () => {
    const p = zKhoraProfile.parse({ id: "p1", username: "ada", displayName: "Ada", bio: "hi" });
    expect(khoraProfileLexicalText(p)).toContain("ada");
    expect(khoraProfileLexicalText(p)).toContain("Ada");
    expect(khoraProfileLexicalText(p)).toContain("hi");
  });
});

describe("zKhoraProfile", () => {
  test("requires username", () => {
    expect(() => zKhoraProfile.parse({ id: "p1" })).toThrow();
  });

  test("normalizes username on parse", () => {
    const p = zKhoraProfile.parse({ id: "p1", username: " Alice-99 " });
    expect(p.username).toBe("alice-99");
  });
});
