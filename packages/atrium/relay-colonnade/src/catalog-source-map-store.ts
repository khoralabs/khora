import type { Database } from "bun:sqlite";
import type { PointerRef } from "@khoralabs/colonnade-persistence";
import { canonicalSourceMapRowBytes, sha256HexLower } from "@khoralabs/colonnade-persistence";

export function relaySyntheticPointer(
  tenantKey: string,
  sourceMapId: string,
  entryKey: string,
): PointerRef {
  const bytes = new TextEncoder().encode(`${tenantKey}\0${sourceMapId}\0${entryKey}`);
  return {
    source_cell_id: "relay",
    source_record_key: entryKey,
    content_hash: sha256HexLower(bytes),
  };
}

/** Escape `%`, `_`, and `\\` for use in `LIKE ... ESCAPE '\\'`. */
export function escapeSqlLikeLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Row returned from {@link RelayCatalogSourceMapStore.listBySourceMap}. */
export type CatalogSourceMapListedRow = {
  entry_key: string;
  pointer: PointerRef;
  projection: unknown;
};

export class RelayCatalogSourceMapStore {
  private readonly upsertStmt;
  private readonly lookupStmt;
  private readonly listByPrefixStmt;
  private readonly deleteStmt;

  constructor(db: Database) {
    this.upsertStmt = db.prepare(
      `INSERT INTO source_map_rows(tenant_key, source_map_id, entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, projection, source_row_content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_key, source_map_id, entry_key) DO UPDATE SET
         pointer_source_cell_id = excluded.pointer_source_cell_id,
         pointer_source_record_key = excluded.pointer_source_record_key,
         pointer_content_hash = excluded.pointer_content_hash,
         projection = excluded.projection,
         source_row_content_hash = excluded.source_row_content_hash`,
    );
    this.lookupStmt = db.query(
      `SELECT projection FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
    );
    this.listByPrefixStmt = db.query(
      `SELECT entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, projection
       FROM source_map_rows
       WHERE tenant_key = ? AND source_map_id = ? AND entry_key LIKE ? ESCAPE '\\'
       ORDER BY rowid ASC`,
    );
    this.deleteStmt = db.prepare(
      `DELETE FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
    );
  }

  upsertRow(input: {
    tenant_key: string;
    source_map_id: string;
    entry_key: string;
    pointer: PointerRef;
    projection: unknown;
  }): void {
    const rowBytes = canonicalSourceMapRowBytes({
      tenant_key: input.tenant_key,
      source_map_id: input.source_map_id,
      entry_key: input.entry_key,
      pointer: input.pointer,
      projection: input.projection,
    });
    const source_row_content_hash = sha256HexLower(rowBytes);
    this.upsertStmt.run(
      input.tenant_key,
      input.source_map_id,
      input.entry_key,
      input.pointer.source_cell_id,
      input.pointer.source_record_key,
      input.pointer.content_hash,
      JSON.stringify(input.projection),
      source_row_content_hash,
    );
  }

  lookupProjection(
    tenant_key: string,
    source_map_id: string,
    entry_key: string,
  ): { found: boolean; projection: unknown } {
    const row = this.lookupStmt.get(tenant_key, source_map_id, entry_key) as
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

  /**
   * All rows for `(tenant_key, source_map_id)` whose `entry_key` starts with `entryKeyPrefix`
   * (prefix match via `LIKE` with escapes for `_` and `%` in the prefix).
   */
  listBySourceMap(
    tenant_key: string,
    source_map_id: string,
    entryKeyPrefix: string,
  ): CatalogSourceMapListedRow[] {
    const pattern = `${escapeSqlLikeLiteral(entryKeyPrefix)}%`;
    const rows = this.listByPrefixStmt.all(
      tenant_key,
      source_map_id,
      pattern,
    ) as {
      entry_key: string;
      pointer_source_cell_id: string;
      pointer_source_record_key: string;
      pointer_content_hash: string;
      projection: string;
    }[];
    const out: CatalogSourceMapListedRow[] = [];
    for (const r of rows) {
      let projection: unknown = {};
      try {
        projection = JSON.parse(r.projection) as unknown;
      } catch {
        /* keep {} */
      }
      out.push({
        entry_key: r.entry_key,
        pointer: {
          source_cell_id: r.pointer_source_cell_id,
          source_record_key: r.pointer_source_record_key,
          content_hash: r.pointer_content_hash,
        },
        projection,
      });
    }
    return out;
  }

  /**
   * Rows matching `entry_key LIKE pattern ESCAPE '\\'` (caller supplies full pattern, e.g.
   * `'%/' || escapeSqlLikeLiteral(postId)` for inbox keys shaped `recipientId/postId`).
   */
  listBySourceMapEntryKeyLike(
    tenant_key: string,
    source_map_id: string,
    entryKeyLikePattern: string,
  ): CatalogSourceMapListedRow[] {
    const rows = this.listByPrefixStmt.all(
      tenant_key,
      source_map_id,
      entryKeyLikePattern,
    ) as {
      entry_key: string;
      pointer_source_cell_id: string;
      pointer_source_record_key: string;
      pointer_content_hash: string;
      projection: string;
    }[];
    const out: CatalogSourceMapListedRow[] = [];
    for (const r of rows) {
      let projection: unknown = {};
      try {
        projection = JSON.parse(r.projection) as unknown;
      } catch {
        /* keep {} */
      }
      out.push({
        entry_key: r.entry_key,
        pointer: {
          source_cell_id: r.pointer_source_cell_id,
          source_record_key: r.pointer_source_record_key,
          content_hash: r.pointer_content_hash,
        },
        projection,
      });
    }
    return out;
  }

  deleteRow(tenant_key: string, source_map_id: string, entry_key: string): void {
    this.deleteStmt.run(tenant_key, source_map_id, entry_key);
  }
}
