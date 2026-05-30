import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  getUsersDatabase,
  initUsersSchema,
  registerKhoraHost,
  resetUsersDatabase,
} from "./index.ts";
import {
  InvalidClientOriginError,
  listCorsTrustedOrigins,
  normalizeClientOrigin,
  resolveHostTrustedOrigin,
  setHostClientOrigin,
  setHostCorsTrusted,
} from "./trusted-origins.ts";

describe("trusted origins", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initUsersSchema(getUsersDatabase());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("resolveHostTrustedOrigin uses clientOrigin when set", () => {
    const db = getUsersDatabase();
    const host = registerKhoraHost(db, {
      slug: "web",
      baseUrl: "http://localhost:8788",
    });
    const active = activateKhoraHost(db, host.id);
    setHostClientOrigin(db, active.id, "https://khoralabs.com");
    const updated = setHostCorsTrusted(db, active.id, true);
    expect(resolveHostTrustedOrigin(updated)).toBe("https://khoralabs.com");
  });

  test("resolveHostTrustedOrigin falls back to baseUrl origin", () => {
    const db = getUsersDatabase();
    const host = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "api", baseUrl: "http://localhost:8788" }).id,
    );
    expect(resolveHostTrustedOrigin(host)).toBe("http://localhost:8788");
  });

  test("listCorsTrustedOrigins returns only active trusted hosts", () => {
    const db = getUsersDatabase();
    registerKhoraHost(db, { slug: "pending-host", baseUrl: "http://localhost:8789" });
    expect(listCorsTrustedOrigins(db)).toHaveLength(0);

    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "active-host", baseUrl: "http://localhost:8788" }).id,
    );
    setHostCorsTrusted(db, active.id, true);
    expect(listCorsTrustedOrigins(db)).toEqual(["http://localhost:8788"]);
  });

  test("normalizeClientOrigin rejects path", () => {
    expect(() => normalizeClientOrigin("https://example.com/path")).toThrow(
      InvalidClientOriginError,
    );
  });
});
