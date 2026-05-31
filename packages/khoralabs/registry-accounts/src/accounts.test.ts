import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initCatalogSchema } from "@khoralabs/registry-catalog";
import { linkBetterAuthUser } from "./accounts";
import { findMarketingConsent, subscribeMarketing } from "./marketing-consents";

function testDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

describe("@khoralabs/registry-accounts accounts", () => {
  let db: Database;

  beforeEach(async () => {
    db = testDb();
    await initCatalogSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test("creates marketing consent with normalized email", () => {
    subscribeMarketing(db, {
      email: "News@Example.com",
      listSlug: "khora-waitlist",
      sourceApp: "khoralabs-homepage",
    });
    const consent = findMarketingConsent(db, "news@example.com", "khora-waitlist");
    expect(consent?.email).toBe("news@example.com");
    expect(consent?.optedOutAtMs).toBeNull();
  });

  test("merges pre-account marketing consent on sign-in", () => {
    subscribeMarketing(db, { email: "user@example.com", listSlug: "khora-waitlist" });

    const account = linkBetterAuthUser(db, {
      providerSubject: "ba-user-1",
      email: "user@example.com",
    });

    const consent = findMarketingConsent(db, "user@example.com", "khora-waitlist");
    expect(consent?.accountId).toBe(account.id);
  });
});
