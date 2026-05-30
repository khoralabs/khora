import { describe, expect, test } from "bun:test";
import { isSha256HexLower, toSha256HexLower } from "./session-protocol-types";

describe("Sha256HexLower", () => {
  test("isSha256HexLower", () => {
    const valid = "a".repeat(64);
    expect(isSha256HexLower(valid)).toBe(true);
    expect(isSha256HexLower("GG".repeat(32))).toBe(false);
    expect(isSha256HexLower("a".repeat(63))).toBe(false);
  });

  test("toSha256HexLower", () => {
    const h = "b".repeat(64);
    expect(toSha256HexLower(h)).toBe(h);
    expect(() => toSha256HexLower("bad")).toThrow();
  });
});
