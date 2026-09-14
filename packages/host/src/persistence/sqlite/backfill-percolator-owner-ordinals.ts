import type { Database } from "bun:sqlite";
import type { PrincipalOrdinalPort } from "../core";

const TABLES = ["percolator_filter_queries", "percolator_semantic_queries"] as const;

/** Backfill legacy standing queries created before owner ordinals were persisted. */
export function backfillPercolatorOwnerOrdinals(
  db: Database,
  principalOrdinals: PrincipalOrdinalPort,
): number {
  const owners = new Set<string>();
  for (const table of TABLES) {
    for (const row of db
      .query<{ owner_id: string }, []>(
        `SELECT DISTINCT owner_id FROM ${table} WHERE owner_ordinal = 0`,
      )
      .all()) {
      owners.add(row.owner_id);
    }
  }
  if (owners.size === 0) return 0;
  const updates = TABLES.map((table) =>
    db.prepare(`UPDATE ${table} SET owner_ordinal = ? WHERE owner_id = ? AND owner_ordinal = 0`),
  );
  let updated = 0;
  db.transaction(() => {
    for (const ownerId of [...owners].sort()) {
      const ordinal = principalOrdinals.getOrCreate(ownerId);
      for (const update of updates) {
        updated += update.run(ordinal, ownerId).changes;
      }
    }
  })();
  return updated;
}
