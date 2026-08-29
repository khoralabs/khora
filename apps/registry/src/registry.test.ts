import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { subscribeMarketing } from "@khoralabs/registry/accounts";
import { seedDefaultHost } from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";

describe("registry domain", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
    await seedDefaultHost(getRegistrySqliteBundle().registry, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("marketing subscribe stores consent", async () => {
    const db = getRegistrySqliteBundle().registry;
    const consent = await subscribeMarketing(db, {
      email: "a@b.com",
      listSlug: "khora-waitlist",
      sourceApp: "test",
    });
    expect(consent.listSlug).toBe("khora-waitlist");
    expect(consent.sourceApp).toBe("test");
  });
});
