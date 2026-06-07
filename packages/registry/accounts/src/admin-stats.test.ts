import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initCatalogSchema, seedDefaultHost } from "@khoralabs/registry-catalog";
import { linkBetterAuthUser } from "./accounts";
import { lookupRegistryByEmail } from "./admin-stats";
import { subscribeMarketing } from "./marketing-consents";

function testDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.run("PRAGMA foreign_keys = ON;");
  return db;
}

describe("registry-accounts admin lookup", () => {
  let db: Database;

  beforeEach(async () => {
    db = testDb();
    await initCatalogSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    subscribeMarketing(db, { email: "a@b.com", listSlug: "khora-waitlist" });
    linkBetterAuthUser(db, { providerSubject: "user-1", email: "a@b.com" });
  });

  afterEach(() => {
    db.close();
  });

  test("lookupRegistryByEmail returns linked records", () => {
    const lookup = lookupRegistryByEmail(db, "a@b.com");
    expect(lookup.account?.id).toBeDefined();
    expect(lookup.marketingConsents).toHaveLength(1);
    expect(lookup.membershipsCount).toBe(0);
  });
});
