import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ensurePercolatorSchema } from "@khoralabs/percolator/sqlite";
import { createInMemoryKhoraHostPersistence } from "../core";
import { backfillPercolatorOwnerOrdinals } from "./backfill-percolator-owner-ordinals";

test("backfills legacy percolator owner ordinals idempotently", () => {
  const db = new Database(":memory:");
  ensurePercolatorSchema(db);
  db.prepare(
    `INSERT INTO percolator_filter_queries
      (id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("q1", "did:test:legacy", '{"content":{}}', 0, 1, 1, 1);
  db.prepare(
    `INSERT INTO percolator_semantic_queries
      (id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("q2", "did:test:semantic", '{"content":{"text":"x"}}', 0, 1, 1, 1);
  const ordinals = createInMemoryKhoraHostPersistence().principalOrdinals;

  expect(backfillPercolatorOwnerOrdinals(db, ordinals)).toBe(2);
  expect(
    db
      .query<{ owner_ordinal: number }, []>(
        "SELECT owner_ordinal FROM percolator_filter_queries WHERE id = 'q1'",
      )
      .get()?.owner_ordinal,
  ).toBe(ordinals.getByDid("did:test:legacy"));
  expect(
    db
      .query<{ owner_ordinal: number }, []>(
        "SELECT owner_ordinal FROM percolator_semantic_queries WHERE id = 'q2'",
      )
      .get()?.owner_ordinal,
  ).toBe(ordinals.getByDid("did:test:semantic"));
  expect(ordinals.getByDid("did:test:legacy")).not.toBe(ordinals.getByDid("did:test:semantic"));
  expect(backfillPercolatorOwnerOrdinals(db, ordinals)).toBe(0);
});
