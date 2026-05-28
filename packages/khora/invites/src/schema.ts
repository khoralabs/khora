/** Invite token kinds stored in `at2_invite_tokens`. */
export const KHORA_INVITE_KIND = {
  root: "root",
  seed: "seed",
  standard: "standard",
} as const;

export type KhoraInviteKind = (typeof KHORA_INVITE_KIND)[keyof typeof KHORA_INVITE_KIND];

export function ensureKhoraInviteSchema(db: import("bun:sqlite").Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS at2_invite_tokens (
      token_hash TEXT PRIMARY KEY NOT NULL,
      created_at_ms INTEGER NOT NULL,
      consumed_at_ms INTEGER,
      consumed_by_did TEXT,
      minted_by_did TEXT,
      kind TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_at2_invite_one_root
      ON at2_invite_tokens(kind)
      WHERE kind = 'root';
    CREATE INDEX IF NOT EXISTS idx_at2_invite_minter ON at2_invite_tokens(minted_by_did, created_at_ms);
  `);
}
