import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { subscribeMarketing } from "@khoralabs/registry/accounts";
import {
  ensureRegistrySchema,
  getRegistryDomainDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry/auth";
import { seedDefaultHost } from "@khoralabs/registry/catalog";

describe("registry domain", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    await seedDefaultHost(getRegistryDomainDatabase(), {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("marketing subscribe stores consent", async () => {
    const db = getRegistryDomainDatabase();
    const consent = await subscribeMarketing(db, {
      email: "a@b.com",
      listSlug: "khora-waitlist",
      sourceApp: "test",
    });
    expect(consent.listSlug).toBe("khora-waitlist");
    expect(consent.sourceApp).toBe("test");
  });
});
