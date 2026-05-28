import { describe, expect, test } from "bun:test";

import {
  displayNameFromFlags,
  parseTopK,
  profilePatchFromFlags,
  registerFieldsFromFlags,
} from "./flags.ts";

describe("registerFieldsFromFlags", () => {
  test("returns null when any required field is missing", () => {
    expect(registerFieldsFromFlags({ username: "ada" })).toBeNull();
    expect(registerFieldsFromFlags({ username: "ada", name: "Ada" })).toBeNull();
  });

  test("returns fields when username, name, and bio are set", () => {
    expect(
      registerFieldsFromFlags({
        username: "ada",
        name: "Ada Lovelace",
        bio: "First programmer",
      }),
    ).toEqual({
      username: "ada",
      displayName: "Ada Lovelace",
      bio: "First programmer",
    });
  });

  test("accepts display-name alias", () => {
    const f = registerFieldsFromFlags({
      username: "ada",
      "display-name": "Ada",
      bio: "hi",
    });
    expect(f?.displayName).toBe("Ada");
  });
});

describe("profilePatchFromFlags", () => {
  test("rejects --username", () => {
    expect(() => profilePatchFromFlags({ username: "bob" })).toThrow(/cannot be changed/i);
  });

  test("returns null when no patch fields", () => {
    expect(profilePatchFromFlags({})).toBeNull();
  });

  test("accepts name and bio", () => {
    expect(profilePatchFromFlags({ name: "Ada", bio: "Notes" })).toEqual({
      displayName: "Ada",
      bio: "Notes",
    });
  });
});

describe("displayNameFromFlags", () => {
  test("prefers --name over display-name", () => {
    expect(displayNameFromFlags({ name: "A", "display-name": "B" })).toBe("A");
  });
});

describe("parseTopK", () => {
  test("parses positive integer", () => {
    expect(parseTopK({ "top-k": "5" })).toBe(5);
  });

  test("rejects invalid top-k", () => {
    expect(() => parseTopK({ "top-k": "0" })).toThrow(/positive integer/i);
  });
});
