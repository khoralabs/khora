import { describe, expect, test } from "bun:test";
import { isSha256HexLower, toSha256HexLower } from "./frame-protocol-types.ts";

describe("Sha256HexLower", () => {
  test("toSha256HexLower", () => {
    const h = "c".repeat(64);
    expect(toSha256HexLower(h)).toBe(h);
    expect(isSha256HexLower(h)).toBe(true);
  });

  test("invalid", () => {
    expect(() => toSha256HexLower("short")).toThrow();
  });
});
