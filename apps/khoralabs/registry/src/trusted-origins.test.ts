import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  getUsersDatabase,
  registerKhoraHost,
  resetUsersDatabase,
  setHostClientOrigin,
  setHostCorsTrusted,
} from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import { corsHeaders } from "./cors.ts";
import { readRegistryTrustedOrigins } from "./trusted-origins.ts";

describe("readRegistryTrustedOrigins", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.REGISTRY_URL = "http://localhost:4000";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.REGISTRY_URL;
    resetUsersDatabase();
  });

  test("includes trusted active host origin", () => {
    const db = getUsersDatabase();
    const host = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" }).id,
    );
    setHostClientOrigin(db, host.id, "https://khoralabs.com");
    setHostCorsTrusted(db, host.id, true);

    const origins = readRegistryTrustedOrigins(db);
    expect(origins).toContain("https://khoralabs.com");
    expect(origins).toContain("http://localhost:4000");
  });

  test("corsHeaders allows trusted origin", () => {
    const db = getUsersDatabase();
    const host = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" }).id,
    );
    setHostCorsTrusted(db, host.id, true);

    const headers = corsHeaders("http://localhost:8788");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:8788");
  });
});
