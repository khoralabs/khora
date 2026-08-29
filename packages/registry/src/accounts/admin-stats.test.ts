import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { seedDefaultHost } from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { linkBetterAuthUser } from "./accounts";
import { lookupRegistryByEmail } from "./admin-stats";
import { subscribeMarketing } from "./marketing-consents";

function _testDb() {
  const sqlite = new Database(":memory:");
  return createRegistrySqliteDatabase(sqlite);
}

describe("registry-accounts admin lookup", () => {
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

  test("lookupRegistryByEmail returns linked records", async () => {
    const lookup = await lookupRegistryByEmail(db, "a@b.com");
    expect(lookup.account?.id).toBeDefined();
    expect(lookup.marketingConsents).toHaveLength(1);
    expect(lookup.membershipsCount).toBe(0);
  });
});
