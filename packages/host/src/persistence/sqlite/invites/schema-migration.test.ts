import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ensureKhoraInviteSchema } from "./schema";

describe("invite schema migration", () => {
  test("adds parent_token_hash and backfills lineage from consumed tokens", () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE khora_invite_tokens (
        token_hash TEXT PRIMARY KEY NOT NULL,
        created_at_ms INTEGER NOT NULL,
        consumed_at_ms INTEGER,
        consumed_by_did TEXT,
        minted_by_did TEXT,
        kind TEXT NOT NULL
      );
    `);
    db.run(
      `INSERT INTO khora_invite_tokens
         (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES ('hash-a', 1, 2, 'did:invitee', 'did:inviter', 'standard')`,
    );
    db.run(
      `INSERT INTO khora_invite_tokens
         (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES ('hash-b', 3, NULL, NULL, 'did:inviter', 'standard')`,
    );

    ensureKhoraInviteSchema(db);

    const cols = (
      db.prepare("PRAGMA table_info(khora_invite_tokens)").all() as { name: string }[]
    ).map((r) => r.name);
    expect(cols).toContain("parent_token_hash");

    const lineage = db
      .prepare(
        `SELECT token_hash, inviter_did, invitee_did, kind FROM khora_invite_lineage ORDER BY token_hash`,
      )
      .all() as Array<{
      token_hash: string;
      inviter_did: string | null;
      invitee_did: string;
      kind: string;
    }>;
    expect(lineage).toEqual([
      {
        token_hash: "hash-a",
        inviter_did: "did:inviter",
        invitee_did: "did:invitee",
        kind: "standard",
      },
    ]);

    // Idempotent
    ensureKhoraInviteSchema(db);
    const count = (
      db.prepare(`SELECT COUNT(1) AS c FROM khora_invite_lineage`).get() as { c: number }
    ).c;
    expect(count).toBe(1);
    db.close();
  });
});
