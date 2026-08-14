import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { ensureRegistrySchema } from "@khoralabs/registry-auth";
import {
  activateKhoraHost,
  registerKhoraHost,
  replaceHostTrustedOrigins,
  requestHostTrustedOrigin,
  setHostRegistryParticipation,
} from "@khoralabs/registry-catalog";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry-sqlite";
import { corsHeadersForTrustedOrigins } from "./cors";
import { readRegistryTrustedOrigins } from "./trusted-origins";

describe("readRegistryTrustedOrigins", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.REGISTRY_URL = "http://localhost:4000";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.REGISTRY_URL;
    resetRegistrySqliteDatabase();
  });

  test("includes explicit trusted origins from participating hosts", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host } = await activateKhoraHost(
      db,
      (await registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" })).host.id,
    );
    await replaceHostTrustedOrigins(db, host.id, [
      "http://localhost:8788",
      "https://khoralabs.com",
    ]);
    await setHostRegistryParticipation(db, host.id, true);

    const origins = await readRegistryTrustedOrigins(db);
    expect(origins).toContain("http://localhost:8788");
    expect(origins).toContain("https://khoralabs.com");
    expect(origins).toContain("http://localhost:4000");
  });

  test("corsHeaders allows declared trusted origin only", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host } = await activateKhoraHost(
      db,
      (await registerKhoraHost(db, { slug: "web-cors", baseUrl: "https://k-0.example.com" })).host
        .id,
    );
    await replaceHostTrustedOrigins(db, host.id, ["https://khoralabs.com"]);
    await setHostRegistryParticipation(db, host.id, true);

    const trusted = await readRegistryTrustedOrigins(db);
    expect(trusted).toContain("https://khoralabs.com");
    expect(trusted).not.toContain("https://k-0.example.com");

    const allowed = corsHeadersForTrustedOrigins(trusted, "https://khoralabs.com") as Record<
      string,
      string
    >;
    expect(allowed["Access-Control-Allow-Origin"]).toBe("https://khoralabs.com");
    const denied = corsHeadersForTrustedOrigins(trusted, "https://k-0.example.com") as Record<
      string,
      string
    >;
    expect(denied["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  test("pending origin requests are excluded from trusted origins until approved", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host } = await activateKhoraHost(
      db,
      (await registerKhoraHost(db, { slug: "pending-cors", baseUrl: "https://k-0.example.com" }))
        .host.id,
    );
    await requestHostTrustedOrigin(db, host.id, "https://pending.example.com");
    await setHostRegistryParticipation(db, host.id, true);
    const trusted = await readRegistryTrustedOrigins(db);
    expect(trusted).not.toContain("https://pending.example.com");
  });
});
