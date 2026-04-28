import type { Database } from "bun:sqlite";
import { DOMAIN_SCHEMA_RUN_SUMMARIES, DOMAIN_SCHEMA_V1, DOMAIN_SCHEMA_V2 } from "./schema.ts";

const LATEST = 3;

/**
 * Idempotent: creates tables if missing, bumps user_version to {@link LATEST}.
 */
export function migrateMatchmakingDomainDb(db: Database): void {
  const v = (db.query("PRAGMA user_version").get() as { user_version: number } | undefined)
    ?.user_version;
  const current = v ?? 0;
  if (current >= LATEST) {
    return;
  }
  if (current === 0) {
    db.run(DOMAIN_SCHEMA_V1);
  }
  if (current === 1) {
    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT NOT NULL PRIMARY KEY,
        invite_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        text TEXT NOT NULL,
        kind TEXT,
        priority INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_goals_invite_id ON goals(invite_id);
      CREATE INDEX IF NOT EXISTS idx_goals_subject_id ON goals(subject_id);
    `);
  }
  if (current < 2) {
    // Ensure full latest shape exists for fresh and upgraded DBs.
    db.run(DOMAIN_SCHEMA_V2);
  }
  if (current < 3) {
    db.run(DOMAIN_SCHEMA_RUN_SUMMARIES);
  }
  db.run(`PRAGMA user_version = ${LATEST}`);
}
