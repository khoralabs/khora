import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import {
  deleteAccount,
  findAccountByEmail,
  findBlockedEmail,
  linkBetterAuthUser,
  listBetterAuthSubjectsForAccount,
  reactivateAccountByEmail,
  suspendAccount,
} from "./accounts";
import { findMarketingConsent, subscribeMarketing } from "./marketing-consents";

function _testDb() {
  const sqlite = new Database(":memory:");
  return createRegistrySqliteDatabase(sqlite);
}

describe("@khoralabs/khora-registry/accounts accounts", () => {
  let db: ReturnType<typeof createRegistrySqliteDatabase>;
  let sqlite: Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = createRegistrySqliteDatabase(sqlite);
    await initRegistryDomainSchema(db);
  });

  afterEach(() => {
    void db.close();
    sqlite.close();
  });

  test("creates marketing consent with normalized email", async () => {
    await subscribeMarketing(db, {
      email: "News@Example.com",
      listSlug: "khora-waitlist",
      sourceApp: "khoralabs-homepage",
    });
    const consent = await findMarketingConsent(db, "news@example.com", "khora-waitlist");
    expect(consent?.email).toBe("news@example.com");
    expect(consent?.optedOutAtMs).toBeNull();
  });

  test("merges pre-account marketing consent on sign-in", async () => {
    await subscribeMarketing(db, { email: "user@example.com", listSlug: "khora-waitlist" });

    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-user-1",
      email: "user@example.com",
    });

    const consent = await findMarketingConsent(db, "user@example.com", "khora-waitlist");
    expect(consent?.accountId).toBe(account.id);
  });

  test("suspend blocks reused email during link", async () => {
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-user-2",
      email: "blocked@example.com",
    });
    const suspended = await suspendAccount(db, account.id);
    expect(suspended.status).toBe("suspended");
    expect((await findBlockedEmail(db, "blocked@example.com"))?.reason).toBe("suspended");
    await expect(
      linkBetterAuthUser(db, {
        providerSubject: "ba-user-3",
        email: "blocked@example.com",
      }),
    ).rejects.toThrow();
  });

  test("delete hard-purges account and preserves blocked email tombstone", async () => {
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-user-4",
      email: "deleted@example.com",
    });
    const deleted = await deleteAccount(db, account.id);
    expect(deleted.blockedEmailsCount).toBe(1);
    expect(await findAccountByEmail(db, "deleted@example.com")).toBeNull();
    const blocked = await findBlockedEmail(db, "deleted@example.com");
    expect(blocked?.reason).toBe("deleted");
    await expect(
      linkBetterAuthUser(db, {
        providerSubject: "ba-user-5",
        email: "deleted@example.com",
      }),
    ).rejects.toThrow();
  });

  test("reactivate by email restores account with same blocked email", async () => {
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-user-6",
      email: "reactivate@example.com",
    });
    await deleteAccount(db, account.id);
    const reactivated = await reactivateAccountByEmail(db, {
      email: "reactivate@example.com",
      providerSubject: "ba-user-6",
    });
    expect(reactivated.status).toBe("active");
    expect((await findAccountByEmail(db, "reactivate@example.com"))?.id).toBe(reactivated.id);
  });

  test("listBetterAuthSubjectsForAccount returns linked subjects", async () => {
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-subjects-1",
      email: "subjects@example.com",
    });
    expect(await listBetterAuthSubjectsForAccount(db, account.id)).toEqual(["ba-subjects-1"]);
  });

  test("blocked email lookup is normalized", async () => {
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-user-7",
      email: "Case@Example.com",
    });
    await deleteAccount(db, account.id);
    expect(await findBlockedEmail(db, "case@example.com")).not.toBeNull();
    expect(await findBlockedEmail(db, "CASE@example.com")).not.toBeNull();
  });
});
