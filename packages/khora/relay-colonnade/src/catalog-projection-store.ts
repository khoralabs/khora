import type { Database } from "bun:sqlite";

/** Escape `%`, `_`, and `\\` for use in `LIKE ... ESCAPE '\\'`. */
export function escapeSqlLikeLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type CatalogProjectionListedRow = {
  entry_key: string;
  projection: unknown;
};

export class RelayCatalogProjectionStore {
  private readonly upsertStmt;
  private readonly lookupStmt;
  private readonly listByPrefixStmt;
  private readonly deleteStmt;

  constructor(db: Database) {
    this.upsertStmt = db.prepare(
      `INSERT INTO relay_catalog_projections(tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, json(?), ?)
       ON CONFLICT(tenant_key, namespace, entry_key) DO UPDATE SET
         projection = excluded.projection,
         updated_at_ms = excluded.updated_at_ms`,
    );
    this.lookupStmt = db.query(
      `SELECT projection FROM relay_catalog_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
    );
    this.listByPrefixStmt = db.query(
      `SELECT entry_key, projection
       FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ? AND entry_key LIKE ? ESCAPE '\\'
       ORDER BY rowid ASC`,
    );
    this.deleteStmt = db.prepare(
      `DELETE FROM relay_catalog_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
    );
  }

  upsert(input: {
    tenant_key: string;
    namespace: string;
    entry_key: string;
    projection: unknown;
    updated_at_ms?: number;
  }): void {
    const updated_at_ms = input.updated_at_ms ?? Date.now();
    this.upsertStmt.run(
      input.tenant_key,
      input.namespace,
      input.entry_key,
      JSON.stringify(input.projection),
      updated_at_ms,
    );
  }

  lookupProjection(
    tenant_key: string,
    namespace: string,
    entry_key: string,
  ): { found: boolean; projection: unknown } {
    const row = this.lookupStmt.get(tenant_key, namespace, entry_key) as
      | { projection: string }
      | undefined;
    if (row === undefined) {
      return { found: false, projection: {} };
    }
    try {
      return { found: true, projection: JSON.parse(row.projection) as unknown };
    } catch {
      return { found: true, projection: {} };
    }
  }

  listByPrefix(
    tenant_key: string,
    namespace: string,
    entryKeyPrefix: string,
  ): CatalogProjectionListedRow[] {
    const pattern = `${escapeSqlLikeLiteral(entryKeyPrefix)}%`;
    const rows = this.listByPrefixStmt.all(tenant_key, namespace, pattern) as {
      entry_key: string;
      projection: string;
    }[];
    const out: CatalogProjectionListedRow[] = [];
    for (const r of rows) {
      let projection: unknown = {};
      try {
        projection = JSON.parse(r.projection) as unknown;
      } catch {
        /* keep {} */
      }
      out.push({ entry_key: r.entry_key, projection });
    }
    return out;
  }

  deleteRow(tenant_key: string, namespace: string, entry_key: string): void {
    this.deleteStmt.run(tenant_key, namespace, entry_key);
  }
}
