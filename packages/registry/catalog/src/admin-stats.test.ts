import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { linkBetterAuthUser, subscribeMarketing } from "@khoralabs/registry-accounts";
import {
  getRegistryAdminSummary,
  initCatalogSchema,
  lookupRegistryByEmail,
  seedDefaultHost,
} from "./index";

function testDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.run("PRAGMA foreign_keys = ON;");
  return db;
}

describe("admin-stats", () => {
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

  test("getRegistryAdminSummary returns aggregate counts", () => {
    const summary = getRegistryAdminSummary(db);
    expect(summary.accounts.total).toBe(1);
    expect(summary.hosts.total).toBe(1);
    expect(summary.marketingConsents.total).toBe(1);
    expect(summary.memberships.total).toBe(0);
  });

  test("lookupRegistryByEmail returns linked records", () => {
    const lookup = lookupRegistryByEmail(db, "a@b.com");
    expect(lookup.account?.id).toBeDefined();
    expect(lookup.marketingConsents).toHaveLength(1);
    expect(lookup.membershipsCount).toBe(0);
  });
});
