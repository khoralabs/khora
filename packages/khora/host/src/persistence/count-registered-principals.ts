import type { Database } from "bun:sqlite";
import { NAMESPACE_REG_BY_PRINCIPAL } from "./id-conventions";

export function countRegisteredPrincipals(db: Database, tenantKey: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ?`,
    )
    .get(tenantKey, NAMESPACE_REG_BY_PRINCIPAL) as { c: number };
  return row.c;
}
