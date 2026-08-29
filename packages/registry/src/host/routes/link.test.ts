import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { initTestRegistryHostRuntime } from "../test-helpers";
import { handleLinkChallenge } from "./link";

describe("link challenge", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
    initTestRegistryHostRuntime(getRegistrySqliteBundle().registry);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("returns challenge for did", async () => {
    const res = await handleLinkChallenge(
      new Request("http://localhost/v1/link/challenge?did=did:key:test"),
      new URL("http://localhost/v1/link/challenge?did=did:key:test"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { challengeId: string; expiresAtMs: number };
    expect(json.challengeId.length).toBeGreaterThan(0);
    expect(json.expiresAtMs).toBeGreaterThan(Date.now());
  });
});
