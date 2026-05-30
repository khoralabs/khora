import { describe, expect, test } from "bun:test";
import type { KhoraHost } from "@khoralabs/users";
import { hostToPublicJson } from "./host-json";

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
    healthStatus: "up",
    healthCheckedAtMs: 100,
    healthLatencyMs: 5,
    healthProbedEndpoint: "ready",
    ...overrides,
  };
}

describe("hostToPublicJson", () => {
  test("includes health block", () => {
    const json = hostToPublicJson(mockHost());
    expect(json.health).toEqual({
      status: "up",
      readyPath: "/ready",
      healthPath: "/health",
      checkedAtMs: 100,
      latencyMs: 5,
      probedEndpoint: "ready",
    });
  });
});
