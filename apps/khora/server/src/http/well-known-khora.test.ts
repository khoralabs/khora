import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RELAY_DEFAULT_TENANT_KEY } from "@khoralabs/relay-colonnade";
import { createKhoraHostSpecPort } from "../ops/host-spec-port";
import { buildKhoraWellKnownDocument, handleWellKnownKhora } from "./well-known-khora";

describe("well-known khora", () => {
  let catalogDb: Database;
  let hostSpec: ReturnType<typeof createKhoraHostSpecPort>;
  const prev: Record<string, string | undefined> = {};

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
      tenantKey: RELAY_DEFAULT_TENANT_KEY,
    });
    for (const key of [
      "PORT",
      "KHORA_HOST_SLUG",
      "KHORA_PUBLIC_BASE_URL",
      "KHORA_REGISTRY_URL",
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

  test("builds document with defaults", () => {
    delete process.env.KHORA_HOST_SLUG;
    delete process.env.KHORA_PUBLIC_BASE_URL;
    delete process.env.KHORA_REGISTRY_URL;
    process.env.PORT = "8788";

    const doc = buildKhoraWellKnownDocument(hostSpec);
    expect(doc).toEqual({
      version: 1,
      baseUrl: "http://127.0.0.1:8788",
      endpoints: {
        health: "/health",
        ready: "/ready",
        register: "/v1/register",
      },
    });
  });

  test("includes slug and registry when set", () => {
    hostSpec.patch({
      slug: "my-lab",
      publicBaseUrl: "https://host.example.com",
      registryUrl: "http://localhost:4000",
    });

    const doc = buildKhoraWellKnownDocument(hostSpec);
    expect(doc.slug).toBe("my-lab");
    expect(doc.baseUrl).toBe("https://host.example.com");
    expect(doc.registryUrl).toBe("http://localhost:4000");
  });

  test("env overrides stored slug and registry URL", () => {
    hostSpec.patch({ slug: "stored", registryUrl: "http://stored.example.com" });
    process.env.KHORA_HOST_SLUG = "env-slug";
    process.env.KHORA_REGISTRY_URL = "http://localhost:4000/";

    const doc = buildKhoraWellKnownDocument(hostSpec);
    expect(doc.slug).toBe("env-slug");
    expect(doc.registryUrl).toBe("http://localhost:4000");
  });

  test("handleWellKnownKhora returns JSON", async () => {
    process.env.PORT = "8788";
    const res = handleWellKnownKhora(hostSpec);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
  });
});
