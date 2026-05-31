import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { linkBetterAuthUser } from "../src/accounts";
import { seedDefaultHost } from "../src/khora-hosts";
import { findMarketingConsent, subscribeMarketing } from "../src/marketing-consents";
import { initUsersSchema } from "../src/schema";

function testDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

describe("@khoralabs/users", () => {
  let db: Database;

  beforeEach(async () => {
    db = testDb();
    await initUsersSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test("seeds default host idempotently", () => {
    const first = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const second = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    expect(first.id).toBe(second.id);
    expect(first.slug).toBe("khora-local");
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
