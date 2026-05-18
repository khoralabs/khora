import type { Database } from "bun:sqlite";
import type { NonceStore } from "./nonce-store.ts";

const NONCE_STORE_DDL = `
CREATE TABLE IF NOT EXISTS agent_request_nonces (
  did TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (did, nonce)
);

CREATE INDEX IF NOT EXISTS idx_agent_nonces_expires ON agent_request_nonces(expires_at_ms);
`;

function ensureSchema(db: Database): void {
  db.run(NONCE_STORE_DDL);
}

/** Default SQLite-backed {@link NonceStore} implementation. Creates its own table lazily. */
export function createSqliteNonceStore(db: Database): NonceStore {
  let initialized = false;
  function init(): void {
    if (initialized) return;
    ensureSchema(db);
    initialized = true;
  }
  return {
    tryInsert(p) {
      init();
      try {
        db.prepare(
          "INSERT INTO agent_request_nonces (did, nonce, expires_at_ms) VALUES (?, ?, ?)",
        ).run(p.did, p.nonce, p.expiresAtMs);
        return true;
      } catch {
        return false;
      }
    },
    sweepExpired(nowMs) {
      init();
      const res = db
        .prepare("DELETE FROM agent_request_nonces WHERE expires_at_ms <= ?")
        .run(nowMs);
      return Number(res.changes ?? 0);
    },
  };
}
