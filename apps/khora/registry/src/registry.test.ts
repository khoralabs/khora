import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { subscribeMarketing } from "@khoralabs/registry-accounts";
import {
  ensureRegistrySchema,
  getRegistryDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import { seedDefaultHost } from "@khoralabs/registry-catalog";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";

describe("registry domain", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    seedDefaultHost(getRegistryDatabase(), {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("marketing subscribe stores consent", () => {
    const db = getRegistryDatabase();
    const consent = subscribeMarketing(db, {
      email: "a@b.com",
      listSlug: "khora-waitlist",
      sourceApp: "test",
    });
    expect(consent.listSlug).toBe("khora-waitlist");
    expect(consent.sourceApp).toBe("test");
  });
});
