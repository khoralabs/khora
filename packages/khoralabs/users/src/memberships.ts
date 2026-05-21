import type { Database } from "bun:sqlite";

/** Membership lifecycle writes are deferred to federation phase; schema-only in v1. */

export function countMembershipsForAccount(db: Database, accountId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM memberships WHERE account_id = ?`)
    .get(accountId) as { n: number };
  return row.n;
}
