import { describe, expect, test } from "bun:test";
import { zKhoraHostDiscovery } from "./khora-host-discovery";

describe("zKhoraHostDiscovery", () => {
  test("parses document with population limit", () => {
    const doc = zKhoraHostDiscovery.parse({
      version: 1,
      baseUrl: "https://host.example.com",
      endpoints: { health: "/health", ready: "/ready", register: "/v1/register" },
      population: { current: 3, limit: 100 },
      slug: "lab",
      registryUrl: "https://registry.example.com",
    });
    expect(doc.population.current).toBe(3);
    expect(doc.population.limit).toBe(100);
  });

  test("parses unlimited population when limit omitted", () => {
    const doc = zKhoraHostDiscovery.parse({
      version: 1,
      baseUrl: "https://host.example.com",
      endpoints: { health: "/health", ready: "/ready", register: "/v1/register" },
      population: { current: 0 },
    });
    expect(doc.population.limit).toBeUndefined();
  });

  test("parses optional features", () => {
    const doc = zKhoraHostDiscovery.parse({
      version: 1,
      baseUrl: "https://host.example.com",
      endpoints: { health: "/health", ready: "/ready", register: "/v1/register" },
      population: { current: 0 },
      features: { search: true, invitesRequired: false, inbox: true },
    });
    expect(doc.features?.search).toBe(true);
  });

  test("rejects negative current", () => {
    expect(() =>
      zKhoraHostDiscovery.parse({
        version: 1,
        baseUrl: "https://host.example.com",
        endpoints: { health: "/health", ready: "/ready", register: "/v1/register" },
        population: { current: -1 },
      }),
    ).toThrow();
  });
});
