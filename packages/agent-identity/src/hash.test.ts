import { describe, expect, test } from "bun:test";
import { hashPlainObject } from "./hash.js";

describe("hashPlainObject", () => {
  test("is deterministic for key order", async () => {
    const h1 = await hashPlainObject({ z: 1, a: 2 });
    const h2 = await hashPlainObject({ a: 2, z: 1 });
    expect(h1).toBe(h2);
  });

  test("nested objects sort keys", async () => {
    const h1 = await hashPlainObject({ outer: { z: 1, a: 2 } });
    const h2 = await hashPlainObject({ outer: { a: 2, z: 1 } });
    expect(h1).toBe(h2);
  });
});
