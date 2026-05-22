import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createAccessTokenRequest,
  getRegistryAdminSummary,
  initUsersSchema,
  linkBetterAuthUser,
  lookupRegistryByEmail,
  seedDefaultHost,
  subscribeMarketing,
} from "./index.ts";

function testDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

describe("admin-stats", () => {
  let db: Database;

  beforeEach(async () => {
    db = testDb();
    await initUsersSchema(db);
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    createAccessTokenRequest(db, { email: "a@b.com", hostId: host.id, sourceApp: "test" });
    subscribeMarketing(db, { email: "a@b.com", listSlug: "atrium-waitlist" });
    linkBetterAuthUser(db, { providerSubject: "user-1", email: "a@b.com" });
  });

  afterEach(() => {
    db.close();
  });

  test("getRegistryAdminSummary returns aggregate counts", () => {
    const summary = getRegistryAdminSummary(db);
    expect(summary.accounts.total).toBe(1);
    expect(summary.hosts.total).toBe(1);
    expect(summary.accessTokenRequests.total).toBe(1);
    expect(summary.accessTokenRequests.withoutAccount).toBe(0);
    expect(summary.marketingConsents.total).toBe(1);
    expect(summary.memberships.total).toBe(0);
  });

  test("lookupRegistryByEmail returns linked records", () => {
    const lookup = lookupRegistryByEmail(db, "a@b.com");
    expect(lookup.account?.id).toBeDefined();
    expect(lookup.accessRequests).toHaveLength(1);
    expect(lookup.marketingConsents).toHaveLength(1);
    expect(lookup.membershipsCount).toBe(0);
  });
});
