import { describe, expect, test } from "bun:test";

import {
  minScoreFromFlags,
  nameFromFlags,
  parseTopK,
  profilePatchFromFlags,
  queryFromFlags,
  registerFieldsFromFlags,
} from "./flags";

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

  test("accepts invite-token", () => {
    const f = registerFieldsFromFlags({
      username: "ada",
      name: "Ada",
      bio: "hi",
      "invite-token": "tok",
    });
    expect(f?.inviteToken).toBe("tok");
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

describe("nameFromFlags", () => {
  test("reads --name only", () => {
    expect(nameFromFlags({ name: "Ada" })).toBe("Ada");
    expect(nameFromFlags({ "display-name": "Legacy" })).toBeUndefined();
  });
});

describe("queryFromFlags", () => {
  test("reads --query", () => {
    expect(queryFromFlags({ query: "async rust" })).toBe("async rust");
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

describe("minScoreFromFlags", () => {
  test("parses valid score", () => {
    expect(minScoreFromFlags({ "min-score": "0.5" })).toBe(0.5);
  });

  test("rejects out of range", () => {
    expect(() => minScoreFromFlags({ "min-score": "2" })).toThrow(/between 0 and 1/i);
  });
});
