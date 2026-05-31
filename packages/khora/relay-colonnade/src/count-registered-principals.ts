import type { Database } from "bun:sqlite";
import { RELAY_NAMESPACE_REG_BY_PRINCIPAL } from "./relay-id-conventions";

/** Count principals registered on this host (relay:reg:by-principal projections). */
export function countRegisteredPrincipals(db: Database, tenantKey: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ?`,
    )
    .get(tenantKey, RELAY_NAMESPACE_REG_BY_PRINCIPAL) as { c: number };
  return row.c;
}
