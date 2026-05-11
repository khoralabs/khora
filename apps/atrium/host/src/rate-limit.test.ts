import { describe, expect, test } from "bun:test";
import { createRateLimiter, envRatePerMinute } from "./rate-limit.ts";

describe("createRateLimiter", () => {
  test("allows under max then blocks", () => {
    const lim = createRateLimiter({ windowMs: 60_000, max: 2 });
    expect(lim("a").ok).toBe(true);
    expect(lim("a").ok).toBe(true);
    const third = lim("a");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  test("disabled when rule null", () => {
    const lim = createRateLimiter(null);
    for (let i = 0; i < 5; i++) expect(lim("x").ok).toBe(true);
  });
});

describe("envRatePerMinute", () => {
  test("default when unset", () => {
    const r = envRatePerMinute(undefined, 10);
    expect(r).toEqual({ windowMs: 60_000, max: 10 });
  });

  test("disabled when zero", () => {
    expect(envRatePerMinute("0", 10)).toBeNull();
  });
});
