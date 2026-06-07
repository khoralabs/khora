import type { Database } from "bun:sqlite";

const META_DDL = `
CREATE TABLE IF NOT EXISTS vellum_chains (
  session_id TEXT PRIMARY KEY NOT NULL,
  genesis_hash TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);`;

/** Idempotent DDL for session bookkeeping (orthogonal to `@khoralabs/obp-persistence-sqlite`). */
export function ensureVellumMetaSchema(db: Database): void {
  db.run(META_DDL);
}

export function upsertChainRow(
  db: Database,
  sessionId: string,
  genesisHash: string,
  createdMs: number,
): void {
  db.run(
    `INSERT INTO vellum_chains (session_id, genesis_hash, created_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO NOTHING`,
    [sessionId, genesisHash, createdMs],
  );
}
