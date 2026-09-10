import type { Database } from "bun:sqlite";
import { CATALOG_FEED_INDEXES_DDL, CATALOG_TABLES_DDL } from "../core/schema";

export function ensureCatalogSchema(db: Database): void {
  db.run(CATALOG_TABLES_DDL);
  migrateCatalogSchema(db);
  db.run(CATALOG_FEED_INDEXES_DDL);
}

function migrateCatalogSchema(db: Database): void {
  const pointerCols = new Set(
    (db.prepare("PRAGMA table_info(catalog_pointers)").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  if (pointerCols.size > 0) {
    if (!pointerCols.has("locator_cell_pool_count")) {
      db.run(
        "ALTER TABLE catalog_pointers ADD COLUMN locator_cell_pool_count INTEGER NOT NULL DEFAULT 1",
      );
    }
    if (!pointerCols.has("tenant_key")) {
      db.run("ALTER TABLE catalog_pointers ADD COLUMN tenant_key TEXT NOT NULL DEFAULT ''");
    }
    if (!pointerCols.has("publication_key")) {
      db.run("ALTER TABLE catalog_pointers ADD COLUMN publication_key TEXT NOT NULL DEFAULT ''");
    }
    if (!pointerCols.has("publisher_principal_id")) {
      db.run(
        "ALTER TABLE catalog_pointers ADD COLUMN publisher_principal_id TEXT NOT NULL DEFAULT ''",
      );
    }
    if (!pointerCols.has("published_at_ms")) {
      db.run("ALTER TABLE catalog_pointers ADD COLUMN published_at_ms INTEGER NOT NULL DEFAULT 0");
    }
    db.run(
      `UPDATE catalog_pointers SET publication_key = catalog_pointer_id
       WHERE publication_key = '' OR publication_key IS NULL`,
    );
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS catalog_pointers_tenant_publication
       ON catalog_pointers(tenant_key, publication_key)`,
    );
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_pointer_tags (
      tenant_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      published_at_ms INTEGER NOT NULL,
      catalog_pointer_id TEXT NOT NULL,
      PRIMARY KEY (tenant_key, tag, published_at_ms, catalog_pointer_id)
    )
  `);

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
