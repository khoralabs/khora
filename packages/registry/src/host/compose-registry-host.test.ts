import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import {
  getRegistrySqliteBundle,
  resetRegistrySqliteDatabase,
} from "@khoralabs/khora-registry/sqlite";
import { composeRegistryHost } from "./compose-registry-host";
import type { RegistryAuthHttpPort, RegistryIdentityPort } from "./ports/identity";
import { resolveRegistryPublicUrl } from "./resolve-registry-public-url";
import { initTestRegistryHostRuntime } from "./test-helpers";

describe("resolveRegistryPublicUrl", () => {
  test("prefers REGISTRY_URL over BETTER_AUTH_URL and PORT", () => {
    expect(
      resolveRegistryPublicUrl({
        REGISTRY_URL: "https://registry.example/",
        BETTER_AUTH_URL: "https://auth.example",
        PORT: "9999",
      }),
    ).toBe("https://registry.example");
  });

  test("falls back to BETTER_AUTH_URL when REGISTRY_URL is empty", () => {
    expect(
      resolveRegistryPublicUrl({
        REGISTRY_URL: "  ",
        BETTER_AUTH_URL: "https://auth.example/",
        PORT: "9999",
      }),
    ).toBe("https://auth.example");
  });

  test("falls back to localhost with PORT when URLs unset", () => {
    expect(resolveRegistryPublicUrl({ PORT: "4500" })).toBe("http://localhost:4500");
  });

  test("treats empty PORT as 4000", () => {
    expect(resolveRegistryPublicUrl({ PORT: "   " })).toBe("http://localhost:4000");
  });
});

describe("composeRegistryHost", () => {
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

  test("wires identity routes and host fetch with defaults", async () => {
    const db = getRegistrySqliteBundle().registry;
    const identity: RegistryIdentityPort = {
      getSession: async () => null,
      getSessionCookieHeader: () => null,
    };
    const authHttp: RegistryAuthHttpPort = {
      handleAuthApi: async () => Response.json({ from: "auth" }),
      callAuthEndpoint: async () => new Response(null, { status: 204 }),
      formatSessionCookie: (token) => `session=${token}`,
      extractSessionCookie: () => null,
    };

    const { host, identityRoutes } = composeRegistryHost({
      db,
      identity,
      authHttp,
      adminTokenAuth: null,
      publicUrl: () => "http://localhost:4000",
      resolveTrustedOrigins: () => ["http://localhost:4000"],
    });

    expect(host.db).toBe(db);
    expect(typeof host.fetch).toBe("function");
    expect(typeof host.stop).toBe("function");

    const authRes = await identityRoutes.handle(
      new Request("http://localhost:4000/api/auth/ok"),
      "/api/auth/ok",
    );
    expect(authRes).not.toBeNull();
    if (authRes === null) throw new Error("expected identity response");
    expect(await authRes.json()).toEqual({ from: "auth" });

    host.stop();
  });

  test("applies identityRouteOptions overrides", async () => {
    const db = getRegistrySqliteBundle().registry;
    const identity: RegistryIdentityPort = {
      getSession: async () => null,
      getSessionCookieHeader: () => null,
    };
    const authHttp: RegistryAuthHttpPort = {
      handleAuthApi: async () => new Response(null, { status: 204 }),
      callAuthEndpoint: async () => new Response(null, { status: 204 }),
      formatSessionCookie: (token) => `session=${token}`,
      extractSessionCookie: () => null,
    };

    const { host, identityRoutes } = composeRegistryHost({
      db,
      identity,
      authHttp,
      adminTokenAuth: null,
      publicUrl: () => "http://localhost:4000",
      resolveTrustedOrigins: () => [],
      identityRouteOptions: {
        resourceName: "Custom Registry",
        deviceVerificationPath: "/custom/link",
      },
    });

    const meta = await identityRoutes.handle(
      new Request("http://localhost:4000/.well-known/oauth-protected-resource"),
      "/.well-known/oauth-protected-resource",
    );
    expect(meta).not.toBeNull();
    if (meta === null) throw new Error("expected metadata response");
    const body = (await meta.json()) as { resource_name?: string };
    expect(body.resource_name).toBe("Custom Registry");

    host.stop();
  });
});
