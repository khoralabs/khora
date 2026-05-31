import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { RELAY_DEFAULT_TENANT_KEY } from "@khoralabs/relay-colonnade";
import { createKhoraHostSpecPort } from "../ops/host-spec-port";
import type { HostRouteDeps } from "./deps";
import { handleAdminHostConfigGet, handleAdminHostConfigPatch } from "./host-admin";

const ROOT_TOKEN = "test-root-token-16chars";

describe("host admin config", () => {
  let catalogDb: Database;
  let hostSpec: ReturnType<typeof createKhoraHostSpecPort>;
  const consoleAuth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });

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
  });

  afterEach(() => {
    catalogDb.close();
  });

  function routeDeps(): HostRouteDeps {
    return {
      ctx: {
        hostSpec,
        adminStats: { registeredPrincipalCount: () => 4 },
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      consoleAuth,
    };
  }

  async function loginCookie(): Promise<string> {
    const loginRes = await consoleAuth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT_TOKEN }),
      }),
      new URL("http://x/admin/api/login"),
    );
    const setCookie = loginRes?.headers.get("set-cookie") ?? "";
    return setCookie.split(";")[0] ?? "";
  }

  test("GET returns current count and limit", async () => {
    hostSpec.patch({ populationLimit: 10 });
    const cookie = await loginCookie();
    const res = await handleAdminHostConfigGet(
      new Request("http://x/admin/api/host/config", { headers: { cookie } }),
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
    const cookie = await loginCookie();
    const setRes = await handleAdminHostConfigPatch(
      new Request("http://x/admin/api/host/config", {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ populationLimit: 25 }),
      }),
      routeDeps(),
    );
    expect(setRes.status).toBe(200);
    expect(hostSpec.read()?.populationLimit).toBe(25);

    const clearRes = await handleAdminHostConfigPatch(
      new Request("http://x/admin/api/host/config", {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ populationLimit: null }),
      }),
      routeDeps(),
    );
    expect(clearRes.status).toBe(200);
    expect(hostSpec.read()?.populationLimit).toBeUndefined();
  });
});
