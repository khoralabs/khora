import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { linkBetterAuthUser, suspendAccount } from "@khoralabs/registry/accounts";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { initRegistryHostRuntime } from "../runtime";
import { handleMe } from "./me";

describe("handleMe suspended account", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("returns 403 when account is suspended", async () => {
    const db = getRegistrySqliteBundle().registry;
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-suspended-user",
      email: "suspended@example.com",
    });
    await suspendAccount(db, account.id);

    initRegistryHostRuntime({
      db,
      identity: {
        getSession: async () => ({
          user: { id: "ba-suspended-user", email: "suspended@example.com" },
          session: { id: "sess-1", expiresAt: new Date(Date.now() + 60_000) },
        }),
        getSessionCookieHeader: () => null,
      },
      adminTokenAuth: null,
      publicUrl: () => "http://localhost:4000",
      trustedOrigins: () => [],
    });

    const res = await handleMe(new Request("http://localhost/v1/me"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });
});
