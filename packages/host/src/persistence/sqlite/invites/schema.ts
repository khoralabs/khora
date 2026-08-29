import type { Database } from "bun:sqlite";
import {
  KHORA_INVITE_KIND,
  KHORA_INVITE_TOKENS_DDL,
  type KhoraInviteKind,
} from "../../core/schema/invites-ddl";

export { KHORA_INVITE_KIND, type KhoraInviteKind };

export function ensureKhoraInviteSchema(db: Database): void {
  db.run(KHORA_INVITE_TOKENS_DDL);
}
