import type { Database } from "bun:sqlite";
import { DOMAIN_SCHEMA_V1 } from "./schema.ts";

const LATEST = 1;

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
  db.run(`PRAGMA user_version = ${LATEST}`);
}
