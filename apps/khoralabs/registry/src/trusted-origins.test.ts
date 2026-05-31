import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  getUsersDatabase,
  registerKhoraHost,
  replaceHostTrustedOrigins,
  resetUsersDatabase,
  setHostRegistryParticipation,
} from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import { corsHeadersForTrustedOrigins } from "./cors";
import { readRegistryTrustedOrigins } from "./trusted-origins";

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

  test("includes explicit trusted origins from participating hosts", () => {
    const db = getUsersDatabase();
    const { host } = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" }).host.id,
    );
    replaceHostTrustedOrigins(db, host.id, ["http://localhost:8788", "https://khoralabs.com"]);
    setHostRegistryParticipation(db, host.id, true);

    const origins = readRegistryTrustedOrigins(db);
    expect(origins).toContain("http://localhost:8788");
    expect(origins).toContain("https://khoralabs.com");
    expect(origins).toContain("http://localhost:4000");
  });

  test("corsHeaders allows declared trusted origin only", () => {
    const db = getUsersDatabase();
    const { host } = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "web-cors", baseUrl: "https://k-0.example.com" }).host.id,
    );
    replaceHostTrustedOrigins(db, host.id, ["https://khoralabs.com"]);
    setHostRegistryParticipation(db, host.id, true);

    const trusted = readRegistryTrustedOrigins(db);
    expect(trusted).toContain("https://khoralabs.com");
    expect(trusted).not.toContain("https://k-0.example.com");

    expect(
      corsHeadersForTrustedOrigins(trusted, "https://khoralabs.com")["Access-Control-Allow-Origin"],
    ).toBe("https://khoralabs.com");
    expect(
      corsHeadersForTrustedOrigins(trusted, "https://k-0.example.com")[
        "Access-Control-Allow-Origin"
      ],
    ).toBeUndefined();
  });
});
