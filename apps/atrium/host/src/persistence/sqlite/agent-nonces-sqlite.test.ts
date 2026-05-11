import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { insertNonceIfFresh, sweepExpiredNonces } from "./agent-nonces-sqlite.ts";

function memDb(): Database {
  return new Database(":memory:");
}

describe("agent_request_nonces", () => {
  test("inserts unique (did, nonce) pairs", () => {
    const db = memDb();
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n1", expiresAtMs: 1_000 }),
    ).toBe(true);
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n2", expiresAtMs: 1_000 }),
    ).toBe(true);
    expect(
      insertNonceIfFresh(db, { did: "did:key:b", nonce: "n1", expiresAtMs: 1_000 }),
    ).toBe(true);
  });

  test("rejects duplicate (did, nonce)", () => {
    const db = memDb();
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n1", expiresAtMs: 1_000 }),
    ).toBe(true);
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n1", expiresAtMs: 2_000 }),
    ).toBe(false);
  });

  test("sweepExpiredNonces deletes only expired rows", () => {
    const db = memDb();
    insertNonceIfFresh(db, { did: "did:key:a", nonce: "n1", expiresAtMs: 100 });
    insertNonceIfFresh(db, { did: "did:key:a", nonce: "n2", expiresAtMs: 300 });
    const removed = sweepExpiredNonces(db, 200);
    expect(removed).toBe(1);
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n1", expiresAtMs: 400 }),
    ).toBe(true);
    expect(
      insertNonceIfFresh(db, { did: "did:key:a", nonce: "n2", expiresAtMs: 400 }),
    ).toBe(false);
  });
});
