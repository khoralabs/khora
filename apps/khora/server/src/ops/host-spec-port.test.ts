import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RELAY_DEFAULT_TENANT_KEY } from "@khoralabs/relay-colonnade";
import { createKhoraHostSpecPort } from "./host-spec-port";

describe("host spec port", () => {
  let catalogDb: Database;

  beforeEach(() => {
    catalogDb = new Database(":memory:");
    catalogDb.run(`
      CREATE TABLE relay_catalog_projections (
        tenant_key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        projection JSON NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (tenant_key, namespace, entry_key)
      );
    `);
  });

  afterEach(() => {
    catalogDb.close();
    delete process.env.KHORA_HOST_SLUG;
    delete process.env.KHORA_REGISTRY_URL;
    delete process.env.KHORA_PUBLIC_BASE_URL;
    delete process.env.PORT;
  });

  test("storeSecrets persists before next read", () => {
    const port = createKhoraHostSpecPort({
      catalogDb,
      tenantKey: RELAY_DEFAULT_TENANT_KEY,
    });
    port.storeSecrets({ registrationSecret: "secret-abc" });
    expect(port.readEffective().registrationSecret).toBe("secret-abc");
    expect(port.read()?.registrationSecret).toBe("secret-abc");
  });

  test("management token replaces registration secret on disk", () => {
    const port = createKhoraHostSpecPort({
      catalogDb,
      tenantKey: RELAY_DEFAULT_TENANT_KEY,
    });
    port.storeSecrets({ registrationSecret: "secret-abc" });
    port.storeSecrets({ managementToken: "mgmt-token" });
    expect(port.readEffective().managementToken).toBe("mgmt-token");
    expect(port.read()?.registrationSecret).toBeUndefined();
  });

  test("env overrides effective slug and registry URL", () => {
    const port = createKhoraHostSpecPort({
      catalogDb,
      tenantKey: RELAY_DEFAULT_TENANT_KEY,
    });
    port.patch({ slug: "stored-slug", registryUrl: "http://registry.example.com" });
    process.env.KHORA_HOST_SLUG = "env-slug";
    process.env.KHORA_REGISTRY_URL = "http://env-registry.example.com";
    const effective = port.readEffective();
    expect(effective.slug).toBe("env-slug");
    expect(effective.registryUrl).toBe("http://env-registry.example.com");
  });
});
