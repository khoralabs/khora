import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import { InvalidHostSlugError, normalizeHostSlug } from "./host-slug";
import {
  activateKhoraHost,
  getUsersDatabase,
  initUsersSchema,
  listPublicHosts,
  registerKhoraHost,
  resetUsersDatabase,
} from "./index";

describe("registerKhoraHost", () => {
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

  test("creates pending host not in public list until activated", () => {
    const db = getUsersDatabase();
    const host = registerKhoraHost(db, {
      slug: "my-host",
      baseUrl: "http://localhost:8788",
      displayName: "My Host",
    });
    expect(host.status).toBe("pending");
    expect(host.displayName).toBe("My Host");
    expect(listPublicHosts(db)).toHaveLength(0);

    const { host: active } = activateKhoraHost(db, host.id);
    expect(active.status).toBe("active");
    expect(listPublicHosts(db)).toHaveLength(1);
    expect(listPublicHosts(db)[0]?.slug).toBe("my-host");
  });

  test("rejects duplicate slug", () => {
    const db = getUsersDatabase();
    registerKhoraHost(db, { slug: "dup", baseUrl: "http://localhost:8788" });
    expect(() => registerKhoraHost(db, { slug: "dup", baseUrl: "http://127.0.0.1:8789" })).toThrow(
      /slug already registered/,
    );
  });

  test("rejects duplicate base URL via loopback alias", () => {
    const db = getUsersDatabase();
    registerKhoraHost(db, { slug: "host-a", baseUrl: "http://localhost:8788" });
    expect(() =>
      registerKhoraHost(db, { slug: "host-b", baseUrl: "http://127.0.0.1:8788" }),
    ).toThrow(/base URL already registered/);
  });

  test("invalid slug", () => {
    expect(() => normalizeHostSlug("AB")).toThrow(InvalidHostSlugError);
  });
});
