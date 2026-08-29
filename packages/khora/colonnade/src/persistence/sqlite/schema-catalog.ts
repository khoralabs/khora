import type { Database } from "bun:sqlite";
import { CATALOG_TABLES_DDL } from "../core/schema";

export function ensureCatalogSchema(db: Database): void {
  db.run(CATALOG_TABLES_DDL);
  migrateCatalogSchema(db);
}

function migrateCatalogSchema(db: Database): void {
  const pointerCols = new Set(
    (db.prepare("PRAGMA table_info(catalog_pointers)").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  if (pointerCols.size > 0 && !pointerCols.has("locator_cell_pool_count")) {
    db.run(
      "ALTER TABLE catalog_pointers ADD COLUMN locator_cell_pool_count INTEGER NOT NULL DEFAULT 1",
    );
  }
  const mapCols = new Set(
    (db.prepare("PRAGMA table_info(source_map_rows)").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  if (mapCols.size > 0 && !mapCols.has("pointer_cell_pool_count")) {
    db.run(
      "ALTER TABLE source_map_rows ADD COLUMN pointer_cell_pool_count INTEGER NOT NULL DEFAULT 1",
    );
  }
}
