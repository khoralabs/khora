/** Invite token kinds stored in `khora_invite_tokens`. */
export const KHORA_INVITE_KIND = {
  root: "root",
  seed: "seed",
  standard: "standard",
} as const;

export type KhoraInviteKind = (typeof KHORA_INVITE_KIND)[keyof typeof KHORA_INVITE_KIND];

/** Shared DDL for invite tokens (live bank) and durable lineage. */
export const KHORA_INVITE_TOKENS_DDL = `
CREATE TABLE IF NOT EXISTS khora_invite_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  created_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  consumed_by_did TEXT,
  minted_by_did TEXT,
  kind TEXT NOT NULL,
  parent_token_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_khora_invite_one_root
  ON khora_invite_tokens(kind)
  WHERE kind = 'root';
CREATE INDEX IF NOT EXISTS idx_khora_invite_minter ON khora_invite_tokens(minted_by_did, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_khora_invite_consumer ON khora_invite_tokens(consumed_by_did);

CREATE TABLE IF NOT EXISTS khora_invite_lineage (
  token_hash TEXT PRIMARY KEY NOT NULL,
  parent_token_hash TEXT,
  inviter_did TEXT,
  invitee_did TEXT NOT NULL,
  consumed_at_ms INTEGER NOT NULL,
  kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_khora_invite_lineage_inviter ON khora_invite_lineage(inviter_did, consumed_at_ms);
CREATE INDEX IF NOT EXISTS idx_khora_invite_lineage_invitee ON khora_invite_lineage(invitee_did);
CREATE INDEX IF NOT EXISTS idx_khora_invite_lineage_parent ON khora_invite_lineage(parent_token_hash);
`.trim();
