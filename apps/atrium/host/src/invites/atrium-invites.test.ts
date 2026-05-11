import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ensureSwarmHostSqliteSchema } from "../persistence/sqlite/schema.ts";
import { ATRIUM_INVITE_KIND, createAtriumInvitesRepo, hashInviteToken } from "./atrium-invites.ts";

function openTestDb(): Database {
  const db = new Database(":memory:");
  ensureSwarmHostSqliteSchema(db);
  return db;
}

describe("atrium invites", () => {
  test("hashInviteToken is deterministic", () => {
    const a = hashInviteToken("pep", "tok1");
    const b = hashInviteToken("pep", "tok1");
    expect(a).toBe(b);
    expect(a).not.toBe(hashInviteToken("pep", "tok2"));
  });

  test("tryConsumeInviteToken is single-use", () => {
    const db = openTestDb();
    const pepper = "p";
    const plain = "one-time";
    const h = hashInviteToken(pepper, plain);
    db.run(
      `INSERT INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES (?, ?, NULL, NULL, NULL, ?)`,
      [h, Date.now(), ATRIUM_INVITE_KIND.seed],
    );
    const repo = createAtriumInvitesRepo(db, pepper);
    expect(repo.tryConsumeInviteToken(plain, "did:key:a")).toBe(true);
    expect(repo.tryConsumeInviteToken(plain, "did:key:b")).toBe(false);
  });

  test("rollbackInviteConsumption restores token", () => {
    const db = openTestDb();
    const pepper = "p";
    const plain = "tok";
    const h = hashInviteToken(pepper, plain);
    db.run(
      `INSERT INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES (?, ?, NULL, NULL, NULL, ?)`,
      [h, Date.now(), ATRIUM_INVITE_KIND.seed],
    );
    const repo = createAtriumInvitesRepo(db, pepper);
    expect(repo.tryConsumeInviteToken(plain, "did:key:x")).toBe(true);
    repo.rollbackInviteConsumption(plain, "did:key:x");
    expect(repo.tryConsumeInviteToken(plain, "did:key:y")).toBe(true);
  });

  test("ensureRootInviteIfAbsent only mints once", () => {
    const db = openTestDb();
    const repo = createAtriumInvitesRepo(db, "pepper");
    const a = repo.ensureRootInviteIfAbsent();
    const b = repo.ensureRootInviteIfAbsent();
    expect(a).toBeDefined();
    expect(b).toBeUndefined();
    const n = db
      .query(`SELECT COUNT(1) AS c FROM atrium_invite_tokens WHERE kind = ?`)
      .get(ATRIUM_INVITE_KIND.root) as { c: number };
    expect(n?.c).toBe(1);
  });

  test("mintStandardInviteTokens sets minted_by_did", () => {
    const db = openTestDb();
    const repo = createAtriumInvitesRepo(db, "p");
    const out = repo.mintStandardInviteTokens("did:key:alice", 3);
    expect(out).toHaveLength(3);
    for (const t of out) {
      expect(repo.tryConsumeInviteToken(t, "did:key:bob")).toBe(true);
    }
  });

  test("previewInviteToken for inviter profile", () => {
    const db = openTestDb();
    const pepper = "p";
    const plain = "share";
    const hash = hashInviteToken(pepper, plain);
    const invDid = "did:key:inv";
    db.run(
      `INSERT INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES (?, ?, NULL, NULL, ?, ?)`,
      [hash, Date.now(), invDid, ATRIUM_INVITE_KIND.standard],
    );
    const repo = createAtriumInvitesRepo(db, pepper);
    const pr = repo.previewInviteToken(plain, (did) =>
      did === invDid ? { id: "prof1", displayName: "Inv" } : null,
    );
    expect(pr.ok).toBe(true);
    if (pr.ok) {
      expect(pr.source).toBe("inviter");
      expect(pr.inviter?.did).toBe(invDid);
      expect(pr.inviter?.profile).toEqual({ id: "prof1", displayName: "Inv" });
    }
  });

  test("insertSeedInviteTokens is idempotent by hash", () => {
    const db = openTestDb();
    const repo = createAtriumInvitesRepo(db, "x");
    expect(repo.insertSeedInviteTokens(["a", "a"])).toBe(1);
    expect(repo.insertSeedInviteTokens(["a"])).toBe(0);
  });
});
