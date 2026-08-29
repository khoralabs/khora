import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import {
  type HostRouteDeps,
  handleAdminHostConfigGet,
  handleAdminHostConfigPatch,
} from "@khoralabs/khora-host/http";
import { DEFAULT_TENANT_KEY } from "@khoralabs/khora-host/sqlite";
import { createKhoraHostSpecPort } from "../ops/host-spec-port";

const ROOT_TOKEN = "test-root-token-16chars";

describe("host ops config", () => {
  let hostDb: Database;
  let hostSpec: ReturnType<typeof createKhoraHostSpecPort>;
  const adminTokenAuth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

  beforeEach(() => {
    hostDb = new Database(":memory:");
    hostDb.run(`
      CREATE TABLE khora_host_projections (
        tenant_key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        projection JSON NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (tenant_key, namespace, entry_key)
      );
    `);
    hostSpec = createKhoraHostSpecPort({
      hostDb,
      tenantKey: DEFAULT_TENANT_KEY,
    });
  });

  afterEach(() => {
    hostDb.close();
  });

  function routeDeps(): HostRouteDeps {
    return {
      ctx: {
        hostSpec,
        adminStats: { registeredPrincipalCount: () => 4 },
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      adminTokenAuth,
    };
  }

  function bearerHeaders(extra?: HeadersInit): HeadersInit {
    return { Authorization: `Bearer ${ROOT_TOKEN}`, ...extra };
  }

  test("GET returns current count and limit", async () => {
    hostSpec.patch({ populationLimit: 10 });
    const res = await handleAdminHostConfigGet(
      new Request("http://x/v1/ops/host/config", { headers: bearerHeaders() }),
      routeDeps(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      populationCurrent: number;
      populationLimit?: number;
    };
    expect(body.populationCurrent).toBe(4);
    expect(body.populationLimit).toBe(10);
  });

  test("PATCH sets and clears population limit", async () => {
    const setRes = await handleAdminHostConfigPatch(
      new Request("http://x/v1/ops/host/config", {
        method: "PATCH",
        headers: bearerHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ populationLimit: 25 }),
      }),
      routeDeps(),
    );
    expect(setRes.status).toBe(200);
    expect(hostSpec.read()?.populationLimit).toBe(25);

    const clearRes = await handleAdminHostConfigPatch(
      new Request("http://x/v1/ops/host/config", {
        method: "PATCH",
        headers: bearerHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ populationLimit: null }),
      }),
      routeDeps(),
    );
    expect(clearRes.status).toBe(200);
    expect(hostSpec.read()?.populationLimit).toBeUndefined();
  });
});
