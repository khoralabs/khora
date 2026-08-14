import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import {
  approveDeviceAuthorization,
  consumeDeviceAuthorization,
} from "@khoralabs/registry-accounts";
import { ensureRegistrySchema } from "@khoralabs/registry-auth";
import { seedDefaultHost } from "@khoralabs/registry-catalog";
import {
  type createRegistrySqliteDatabase,
  getRegistrySqliteBundle,
  resetRegistrySqliteDatabase,
} from "@khoralabs/registry-sqlite";
import { type DeviceRouteDeps, handleDeviceAuthorize, handleDeviceToken } from "./device";

function deviceRouteDeps(db: ReturnType<typeof createRegistrySqliteDatabase>): DeviceRouteDeps {
  return {
    db,
    identity: {
      getSession: async () => null,
      getSessionCookieHeader: () => null,
    },
    publicUrl: () => "http://localhost:4000",
    deviceVerificationPath: "/cli/link",
    defaultSourceApp: "khora-cli",
  };
}

describe("registry device flow", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    const db = getRegistrySqliteBundle().registry;
    await seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("authorize then token after approve", async () => {
    const db = getRegistrySqliteBundle().registry;
    const deps = deviceRouteDeps(db);
    const authRes = await handleDeviceAuthorize(
      new Request("http://localhost/v1/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceApp: "test" }),
      }),
      deps,
    );
    expect(authRes.status).toBe(200);
    const authJson = (await authRes.json()) as {
      device_code: string;
      user_code: string;
      verification_url: string;
      expires_in: number;
    };
    expect(authJson.verification_url).toContain("user_code=");
    expect(authJson.expires_in).toBeGreaterThan(0);

    await approveDeviceAuthorization(db, {
      userCode: authJson.user_code,
      sessionToken: "test-session-token-abc",
    });

    const pending = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: "wrong-code" }),
      }),
      deps,
    );
    expect(pending.status).toBe(404);

    const tokenRes = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: authJson.device_code }),
      }),
      deps,
    );
    expect(tokenRes.status).toBe(200);
    const tokenJson = (await tokenRes.json()) as { status: string; session_cookie: string };
    expect(tokenJson.status).toBe("approved");
    expect(tokenJson.session_cookie).toContain("better-auth.session_token=");

    const second = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: authJson.device_code }),
      }),
      deps,
    );
    expect(second.status).toBe(400);
  });

  test("consume marks device consumed", async () => {
    const db = getRegistrySqliteBundle().registry;
    const deps = deviceRouteDeps(db);
    const authRes = await handleDeviceAuthorize(
      new Request("http://localhost/v1/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      deps,
    );
    const authJson = (await authRes.json()) as { device_code: string; user_code: string };
    await approveDeviceAuthorization(db, {
      userCode: authJson.user_code,
      sessionToken: "sess-1",
    });
    const consumed = await consumeDeviceAuthorization(db, authJson.device_code);
    expect(consumed?.status).toBe("consumed");
  });
});
