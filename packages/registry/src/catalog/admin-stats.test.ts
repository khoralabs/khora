import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { linkBetterAuthUser, subscribeMarketing } from "@khoralabs/khora-registry/accounts";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import { getRegistryAdminSummary, lookupRegistryByEmail, seedDefaultHost } from "./index";

function _testDb() {
  const sqlite = new Database(":memory:");
  return createRegistrySqliteDatabase(sqlite);
}

describe("admin-stats", () => {
  let db: ReturnType<typeof createRegistrySqliteDatabase>;
  let sqlite: Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = createRegistrySqliteDatabase(sqlite);
    await initRegistryDomainSchema(db);
    await seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    await subscribeMarketing(db, { email: "a@b.com", listSlug: "khora-waitlist" });
    await linkBetterAuthUser(db, { providerSubject: "user-1", email: "a@b.com" });
  });

  afterEach(() => {
    void db.close();
    sqlite.close();
  });

  test("getRegistryAdminSummary returns aggregate counts", async () => {
    const summary = await getRegistryAdminSummary(db);
    expect(summary.accounts.total).toBe(1);
    expect(summary.hosts.total).toBe(1);
    expect(summary.marketingConsents.total).toBe(1);
    expect(summary.memberships.total).toBe(0);
  });

  test("lookupRegistryByEmail returns linked records", async () => {
    const lookup = await lookupRegistryByEmail(db, "a@b.com");
    expect(lookup.account?.id).toBeDefined();
    expect(lookup.marketingConsents).toHaveLength(1);
    expect(lookup.membershipsCount).toBe(0);
  });
});
