import type { Database } from "bun:sqlite";
import {
  KHORA_INVITE_KIND,
  KHORA_INVITE_TOKENS_DDL,
  type KhoraInviteKind,
} from "../../core/schema/invites-ddl";

export { KHORA_INVITE_KIND, type KhoraInviteKind };

export function ensureKhoraInviteSchema(db: Database): void {
  db.run(KHORA_INVITE_TOKENS_DDL);
  migrateKhoraInviteSchema(db);
}

/** Additive column for existing DBs; backfill lineage from already-consumed tokens. */
function migrateKhoraInviteSchema(db: Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(khora_invite_tokens)").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  if (cols.size > 0 && !cols.has("parent_token_hash")) {
    db.run("ALTER TABLE khora_invite_tokens ADD COLUMN parent_token_hash TEXT");
  }
  db.run(`
    INSERT OR IGNORE INTO khora_invite_lineage
      (token_hash, parent_token_hash, inviter_did, invitee_did, consumed_at_ms, kind)
    SELECT token_hash, parent_token_hash, minted_by_did, consumed_by_did, consumed_at_ms, kind
    FROM khora_invite_tokens
    WHERE consumed_at_ms IS NOT NULL AND consumed_by_did IS NOT NULL
  `);
}
