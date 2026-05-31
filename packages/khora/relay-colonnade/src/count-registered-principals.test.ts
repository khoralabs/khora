import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { countRegisteredPrincipals } from "./count-registered-principals";
import { RELAY_NAMESPACE_REG_BY_PRINCIPAL } from "./relay-id-conventions";
import { ensureRelayCatalogProjectionsSchema } from "./sqlite-setup";

describe("countRegisteredPrincipals", () => {
  test("counts by-principal projections for tenant", () => {
    const db = new Database(":memory:");
    ensureRelayCatalogProjectionsSchema(db);
    const now = Date.now();
    db.prepare(
      `INSERT INTO relay_catalog_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("relay", RELAY_NAMESPACE_REG_BY_PRINCIPAL, "did:1", '{"profileId":"p1"}', now);
    db.prepare(
      `INSERT INTO relay_catalog_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("relay", RELAY_NAMESPACE_REG_BY_PRINCIPAL, "did:2", '{"profileId":"p2"}', now);
    expect(countRegisteredPrincipals(db, "relay")).toBe(2);
    expect(countRegisteredPrincipals(db, "other")).toBe(0);
    db.close();
  });
});
