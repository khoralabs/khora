import { describe, expect, test } from "bun:test";
import { createRateLimiter, envRatePerMinute } from "./rate-limit";

describe("createRateLimiter", () => {
  test("allows under max", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 2 });
    expect(rl("a")).toEqual({ ok: true });
    expect(rl("a")).toEqual({ ok: true });
  });

  test("blocks at max", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(rl("b")).toEqual({ ok: true });
    const second = rl("b");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("envRatePerMinute", () => {
  test("parses zero as disabled", () => {
    expect(envRatePerMinute("0", 10)).toBe(null);
  });

  test("empty uses default max", () => {
    const r = envRatePerMinute(undefined, 42);
    expect(r).toEqual({ windowMs: 60_000, max: 42 });
  });
});
