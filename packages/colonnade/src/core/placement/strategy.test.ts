import { describe, expect, test } from "bun:test";

import { strategyCacheKey } from "./strategy";

describe("strategyCacheKey", () => {
  test("is order-independent for equivalent strategies", () => {
    const a = { kind: "sqlite", dataDir: "/data", sqlCipherKey: "k" };
    const b = { sqlCipherKey: "k", kind: "sqlite", dataDir: "/data" };
    expect(strategyCacheKey(a)).toBe(strategyCacheKey(b));
  });
});
