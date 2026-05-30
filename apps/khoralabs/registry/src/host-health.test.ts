import { describe, expect, test } from "bun:test";
import type { KhoraHost } from "@khoralabs/users";
import { probeHostHealth } from "./host-health";

function mockHost(overrides: Partial<KhoraHost> = {}): KhoraHost {
  return {
    id: "h1",
    slug: "lab",
    baseUrl: "http://localhost:8788",
    displayName: null,
    description: null,
    status: "active",
    optedInAtMs: 0,
    capabilities: null,
    healthReadyPath: "/ready",
    healthPath: "/health",
    healthStatus: "unknown",
    healthCheckedAtMs: null,
    healthLatencyMs: null,
    healthProbedEndpoint: null,
    registryParticipationEnabled: false,
    includedTrustedOrigins: 2,
    ...overrides,
  };
}

describe("probeHostHealth", () => {
  test("ready 200 marks up with ready endpoint", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe("http://localhost:8788/ready");
      return new Response("ready", { status: 200 });
    };
    const result = await probeHostHealth(mockHost(), {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe("up");
    expect(result.probedEndpoint).toBe("ready");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ready fail then health 200 marks up via health", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/ready")) {
        return new Response("not ready", { status: 503 });
      }
      expect(url).toBe("http://localhost:8788/health");
      return new Response("ok", { status: 200 });
    };
    const result = await probeHostHealth(mockHost(), {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe("up");
    expect(result.probedEndpoint).toBe("health");
  });

  test("both non-2xx marks down", async () => {
    const fetchImpl = async () => new Response("nope", { status: 500 });
    const result = await probeHostHealth(mockHost(), {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("down");
    expect(result.probedEndpoint).toBeNull();
    expect(result.latencyMs).toBeNull();
  });

  test("network error marks down", async () => {
    const fetchImpl = async () => {
      throw new Error("connection refused");
    };
    const result = await probeHostHealth(mockHost(), {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("down");
  });
});
