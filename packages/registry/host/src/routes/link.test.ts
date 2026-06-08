import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  ensureRegistrySchema,
  getRegistryDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import { initTestRegistryHostRuntime } from "../test-helpers";
import { handleLinkChallenge } from "./link";

describe("link challenge", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    initTestRegistryHostRuntime(getRegistryDatabase());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
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
