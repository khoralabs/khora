import { describe, expect, test } from "bun:test";
import {
  computeInvocationContextHash,
  invocationContextCanonicalPayload,
  normalizeInvocationContextForHash,
} from "./invocation-context.js";

describe("normalizeInvocationContextForHash", () => {
  test("returns undefined for empty object or non-record root", () => {
    expect(normalizeInvocationContextForHash(undefined)).toBeUndefined();
    expect(normalizeInvocationContextForHash(null)).toBeUndefined();
    expect(normalizeInvocationContextForHash({})).toBeUndefined();
    expect(normalizeInvocationContextForHash("x")).toBeUndefined();
    expect(normalizeInvocationContextForHash(1)).toBeUndefined();
    expect(normalizeInvocationContextForHash([1, 2])).toBeUndefined();
  });

  test("sorts top-level keys and nested keys", () => {
    const n = normalizeInvocationContextForHash({ z: 1, a: { c: 1, b: 2 } });
    if (!n) {
      throw new Error("expected normalized record");
    }
    expect(Object.keys(n)).toEqual(["a", "z"]);
    expect(Object.keys(n.a as object)).toEqual(["b", "c"]);
  });

  test("allowlist filters top-level keys", () => {
    const n = normalizeInvocationContextForHash({ a: 1, b: 2, c: 3 }, { allowlist: ["c", "a"] });
    if (!n) {
      throw new Error("expected normalized record");
    }
    expect(Object.keys(n)).toEqual(["a", "c"]);
  });

  test("rejects function values", () => {
    expect(() => normalizeInvocationContextForHash({ fn: () => {} })).toThrow("function");
  });

  test("rejects circular object", () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(() => normalizeInvocationContextForHash(a)).toThrow("circular");
  });
});

describe("computeInvocationContextHash", () => {
  test("is stable for same object shape", async () => {
    const a = { subjectId: "u1", n: 2, z: 1 };
    const b = { z: 1, n: 2, subjectId: "u1" };
    const ha = await computeInvocationContextHash(a);
    const hb = await computeInvocationContextHash(b);
    expect(ha).toBe(hb);
    expect(ha).toMatch(/^[a-f0-9]{64}$/);
  });

  test("returns undefined for empty", async () => {
    expect(await computeInvocationContextHash(undefined)).toBeUndefined();
    expect(await computeInvocationContextHash({})).toBeUndefined();
  });
});

describe("invocationContextCanonicalPayload", () => {
  test("round-trips for hashPlainObject consumers", () => {
    const p = invocationContextCanonicalPayload({ a: 1 });
    expect(p).toEqual({ kind: "invocation", context: { a: 1 } });
  });
});
