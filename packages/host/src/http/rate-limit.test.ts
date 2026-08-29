import { describe, expect, test } from "bun:test";
import {
  clientIpFromRequest,
  createRateLimiter,
  envRatePerMinute,
  runWithRequestPeerIp,
} from "./rate-limit";

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

describe("clientIpFromRequest", () => {
  test("ignores forwarded headers without trusted proxy", () => {
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" },
    });
    expect(clientIpFromRequest(req, { peerIp: "203.0.113.50" })).toBe("203.0.113.50");
  });

  test("honors x-real-ip when peer is trusted", () => {
    const prev = process.env.TRUSTED_PROXIES;
    process.env.TRUSTED_PROXIES = "10.0.0.2";
    try {
      const req = new Request("http://x/", {
        headers: { "x-real-ip": "203.0.113.9" },
      });
      expect(clientIpFromRequest(req, { peerIp: "10.0.0.2" })).toBe("203.0.113.9");
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = prev;
    }
  });

  test("honors KHORA_TRUSTED_PROXIES", () => {
    const prev = process.env.KHORA_TRUSTED_PROXIES;
    const prevTrusted = process.env.TRUSTED_PROXIES;
    delete process.env.TRUSTED_PROXIES;
    process.env.KHORA_TRUSTED_PROXIES = "10.0.0.3";
    try {
      const req = new Request("http://x/", {
        headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.3" },
      });
      expect(clientIpFromRequest(req, { peerIp: "10.0.0.3" })).toBe("198.51.100.9");
    } finally {
      if (prev === undefined) delete process.env.KHORA_TRUSTED_PROXIES;
      else process.env.KHORA_TRUSTED_PROXIES = prev;
      if (prevTrusted === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = prevTrusted;
    }
  });

  test("uses ALS peer IP when set via runWithRequestPeerIp", () => {
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    const ip = runWithRequestPeerIp("198.51.100.7", () => clientIpFromRequest(req));
    expect(ip).toBe("198.51.100.7");
  });
});
