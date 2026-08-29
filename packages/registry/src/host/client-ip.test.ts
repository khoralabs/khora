import { describe, expect, test } from "bun:test";
import { clientIpFromRequest, runWithRequestPeerIp } from "./client-ip";

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

  test("uses ALS peer IP when set via runWithRequestPeerIp", () => {
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    const ip = runWithRequestPeerIp("198.51.100.7", () => clientIpFromRequest(req));
    expect(ip).toBe("198.51.100.7");
  });
});
