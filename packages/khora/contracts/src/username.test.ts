import { describe, expect, test } from "bun:test";
import { normalizeUsername, zUsername } from "./username.ts";

describe("normalizeUsername", () => {
  test("accepts simple lowercase", () => {
    expect(normalizeUsername("alice")).toBe("alice");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeUsername("  bob  ")).toBe("bob");
  });

  test("folds uppercase to lowercase", () => {
    expect(normalizeUsername("Alice-99")).toBe("alice-99");
    expect(normalizeUsername("BOB")).toBe("bob");
  });

  test("accepts digits and single dashes", () => {
    expect(normalizeUsername("a-b-c-1")).toBe("a-b-c-1");
    expect(normalizeUsername("0")).toBe("0");
  });

  test("rejects empty / whitespace-only", () => {
    expect(() => normalizeUsername("")).toThrow(/empty/i);
    expect(() => normalizeUsername("   ")).toThrow(/empty/i);
  });

  test("rejects leading/trailing dash", () => {
    expect(() => normalizeUsername("-alice")).toThrow();
    expect(() => normalizeUsername("alice-")).toThrow();
  });

  test("rejects consecutive dashes", () => {
    expect(() => normalizeUsername("a--b")).toThrow();
  });

  test("rejects invalid characters", () => {
    expect(() => normalizeUsername("alice_99")).toThrow();
    expect(() => normalizeUsername("alice.99")).toThrow();
    expect(() => normalizeUsername("alice 99")).toThrow();
    expect(() => normalizeUsername("alíce")).toThrow();
  });

  test("rejects length > 39", () => {
    expect(() => normalizeUsername("a".repeat(40))).toThrow();
    expect(normalizeUsername("a".repeat(39))).toBe("a".repeat(39));
  });

  test("rejects reserved names", () => {
    for (const name of ["admin", "khora", "me", "root", "system", "Admin", "  ROOT "]) {
      expect(() => normalizeUsername(name)).toThrow(/reserved/i);
    }
  });

  test("rejects non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(() => normalizeUsername(123)).toThrow();
  });
});

describe("zUsername", () => {
  test("parses and normalizes", () => {
    expect(zUsername.parse(" Alice-99 ")).toBe("alice-99");
  });

  test("rejects invalid input via ZodError", () => {
    const r = zUsername.safeParse("a--b");
    expect(r.success).toBe(false);
  });
});
