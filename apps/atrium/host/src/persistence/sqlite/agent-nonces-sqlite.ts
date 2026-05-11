import type { Database } from "bun:sqlite";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** Insert a fresh `(did, nonce)` pair; returns false on duplicate (replay) or expired timestamp. */
export function insertNonceIfFresh(
  db: Database,
  params: { did: string; nonce: string; expiresAtMs: number },
): boolean {
  ensureSwarmHostSqliteSchema(db);
  try {
    db.prepare(
      "INSERT INTO agent_request_nonces (did, nonce, expires_at_ms) VALUES (?, ?, ?)",
    ).run(params.did, params.nonce, params.expiresAtMs);
    return true;
  } catch {
    return false;
  }
}

/** Delete nonces past their expiry; safe to call opportunistically. */
export function sweepExpiredNonces(db: Database, nowMs: number): number {
  ensureSwarmHostSqliteSchema(db);
  const res = db.prepare("DELETE FROM agent_request_nonces WHERE expires_at_ms <= ?").run(nowMs);
  return Number(res.changes ?? 0);
}
