import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { DEFAULT_TENANT_KEY } from "@khoralabs/khora-host";
import { buildKhoraHostDiscovery } from "../ops/build-host-discovery";
import { createKhoraHostSpecPort } from "../ops/host-spec-port";
import type { HostRouteDeps } from "./deps";
import { handleWellKnownKhora } from "./well-known-khora";

describe("well-known khora", () => {
  let catalogDb: Database;
  let hostSpec: ReturnType<typeof createKhoraHostSpecPort>;
  const prev: Record<string, string | undefined> = {};

  function routeDeps(populationCurrent: number): HostRouteDeps {
    return {
      ctx: {
        hostSpec,
        adminStats: { registeredPrincipalCount: () => populationCurrent },
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      consoleAuth: null,
    };
  }

  beforeEach(() => {
    catalogDb = new Database(":memory:");
    catalogDb.run(`
      CREATE TABLE relay_catalog_projections (
        tenant_key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        projection JSON NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (tenant_key, namespace, entry_key)
      );
    `);
    hostSpec = createKhoraHostSpecPort({
      catalogDb,
      tenantKey: DEFAULT_TENANT_KEY,
    });
    for (const key of [
      "PORT",
      "KHORA_HOST_SLUG",
      "KHORA_PUBLIC_BASE_URL",
      "KHORA_REGISTRY_URL",
      "KHORA_POPULATION_LIMIT",
    ] as const) {
      prev[key] = process.env[key];
    }
  });

  afterEach(() => {
    catalogDb.close();
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  test("builds document with defaults and population", () => {
    delete process.env.KHORA_HOST_SLUG;
    delete process.env.KHORA_PUBLIC_BASE_URL;
    delete process.env.KHORA_REGISTRY_URL;
    delete process.env.KHORA_POPULATION_LIMIT;
    process.env.PORT = "8788";

    const doc = buildKhoraHostDiscovery({ hostSpec, populationCurrent: 0 });
    expect(doc).toEqual({
      version: 1,
      baseUrl: "http://127.0.0.1:8788",
      endpoints: {
        health: "/health",
        ready: "/ready",
        register: "/v1/register",
      },
      population: { current: 0 },
    });
  });

  test("includes slug, registry, and population limit when set", () => {
    hostSpec.patch({
      slug: "my-lab",
      publicBaseUrl: "https://host.example.com",
      registryUrl: "http://localhost:4000",
      populationLimit: 50,
    });

    const doc = buildKhoraHostDiscovery({ hostSpec, populationCurrent: 3 });
    expect(doc.slug).toBe("my-lab");
    expect(doc.baseUrl).toBe("https://host.example.com");
    expect(doc.registryUrl).toBe("http://localhost:4000");
    expect(doc.population).toEqual({ current: 3, limit: 50 });
  });

  test("env overrides stored slug and registry URL", () => {
    hostSpec.patch({ slug: "stored", registryUrl: "http://stored.example.com" });
    process.env.KHORA_HOST_SLUG = "env-slug";
    process.env.KHORA_REGISTRY_URL = "http://localhost:4000/";

    const doc = buildKhoraHostDiscovery({ hostSpec, populationCurrent: 0 });
    expect(doc.slug).toBe("env-slug");
    expect(doc.registryUrl).toBe("http://localhost:4000");
  });

  test("handleWellKnownKhora returns JSON with live count", async () => {
    process.env.PORT = "8788";
    const res = handleWellKnownKhora(routeDeps(7));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { version: number; population: { current: number } };
    expect(body.version).toBe(1);
    expect(body.population.current).toBe(7);
  });
});
