import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import type { RegistryHostContext } from "./context";
import { handleRegistryRequest } from "./handle-registry-request";
import type { RegistryIdentityRoutes } from "./ports/identity";
import { initTestRegistryHostRuntime } from "./test-helpers";

describe("handleRegistryRequest", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.REGISTRY_URL = "http://localhost:4000";
    applyTestEncryptionEnv();
    const db = getRegistrySqliteBundle().registry;
    await initRegistryDomainSchema(db);
    initTestRegistryHostRuntime(db);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.REGISTRY_URL;
    resetRegistrySqliteDatabase();
  });

  test("handles OPTIONS preflight", async () => {
    const host: RegistryHostContext = {
      db: getRegistrySqliteBundle().registry,
      identity: { getSession: async () => null, getSessionCookieHeader: () => null },
      fetch: async () => Response.json({ ok: false }, { status: 500 }),
      stop() {},
    };
    const identityRoutes: RegistryIdentityRoutes = {
      handle: async () => Response.json({ ok: false }, { status: 500 }),
    };

    const res = await handleRegistryRequest(
      new Request("http://localhost:4000/v1/hosts", { method: "OPTIONS" }),
      { host, identityRoutes },
    );
    expect(res.status).toBe(204);
  });

  test("wraps identity route responses with CORS", async () => {
    const host: RegistryHostContext = {
      db: getRegistrySqliteBundle().registry,
      identity: { getSession: async () => null, getSessionCookieHeader: () => null },
      fetch: async () => Response.json({ from: "host" }, { status: 500 }),
      stop() {},
    };
    const identityRoutes: RegistryIdentityRoutes = {
      handle: async (_req, path) => {
        if (path === "/api/auth/ok") return Response.json({ from: "identity" });
        return null;
      },
    };

    const res = await handleRegistryRequest(
      new Request("http://localhost:4000/api/auth/ok", {
        headers: { Origin: "http://localhost:4000" },
      }),
      { host, identityRoutes },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "identity" });
  });

  test("falls through to host.fetch when identity returns null", async () => {
    let hostCalled = false;
    const host: RegistryHostContext = {
      db: getRegistrySqliteBundle().registry,
      identity: { getSession: async () => null, getSessionCookieHeader: () => null },
      fetch: async () => {
        hostCalled = true;
        return Response.json({ from: "host" });
      },
      stop() {},
    };
    const identityRoutes: RegistryIdentityRoutes = {
      handle: async () => null,
    };

    const res = await handleRegistryRequest(new Request("http://localhost:4000/v1/hosts"), {
      host,
      identityRoutes,
    });
    expect(hostCalled).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "host" });
  });
});
