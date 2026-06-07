import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initCatalogSchema } from "@khoralabs/registry-catalog";
import {
  deleteAccount,
  findAccountByEmail,
  findBlockedEmail,
  linkBetterAuthUser,
  reactivateAccountByEmail,
  suspendAccount,
} from "./accounts";
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

  test("suspend blocks reused email during link", () => {
    const account = linkBetterAuthUser(db, {
      providerSubject: "ba-user-2",
      email: "blocked@example.com",
    });
    const suspended = suspendAccount(db, account.id);
    expect(suspended.status).toBe("suspended");
    expect(findBlockedEmail(db, "blocked@example.com")?.reason).toBe("suspended");
    expect(() =>
      linkBetterAuthUser(db, {
        providerSubject: "ba-user-3",
        email: "blocked@example.com",
      }),
    ).toThrow();
  });

  test("delete hard-purges account and preserves blocked email tombstone", () => {
    const account = linkBetterAuthUser(db, {
      providerSubject: "ba-user-4",
      email: "deleted@example.com",
    });
    const deleted = deleteAccount(db, account.id);
    expect(deleted.blockedEmailsCount).toBe(1);
    expect(findAccountByEmail(db, "deleted@example.com")).toBeNull();
    const blocked = findBlockedEmail(db, "deleted@example.com");
    expect(blocked?.reason).toBe("deleted");
    expect(() =>
      linkBetterAuthUser(db, {
        providerSubject: "ba-user-5",
        email: "deleted@example.com",
      }),
    ).toThrow();
  });

  test("reactivate by email restores account with same blocked email", () => {
    const account = linkBetterAuthUser(db, {
      providerSubject: "ba-user-6",
      email: "reactivate@example.com",
    });
    deleteAccount(db, account.id);
    const reactivated = reactivateAccountByEmail(db, {
      email: "reactivate@example.com",
      providerSubject: "ba-user-6",
    });
    expect(reactivated.status).toBe("active");
    expect(findAccountByEmail(db, "reactivate@example.com")?.id).toBe(reactivated.id);
  });

  test("blocked email lookup is normalized", () => {
    const account = linkBetterAuthUser(db, {
      providerSubject: "ba-user-7",
      email: "Case@Example.com",
    });
    deleteAccount(db, account.id);
    expect(findBlockedEmail(db, "case@example.com")).not.toBeNull();
    expect(findBlockedEmail(db, "CASE@example.com")).not.toBeNull();
  });
});
