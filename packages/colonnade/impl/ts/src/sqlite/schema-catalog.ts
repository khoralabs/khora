import type { Database } from "bun:sqlite";

export function ensureCatalogSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS discovery_documents (
      document_key TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_pointers (
      catalog_pointer_id TEXT PRIMARY KEY NOT NULL,
      locator_cell_id TEXT NOT NULL,
      locator_record_key TEXT NOT NULL,
      locator_cell_pool_count INTEGER NOT NULL DEFAULT 1,
      content_hash TEXT NOT NULL,
      projection TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_map_rows (
      tenant_key TEXT NOT NULL,
      source_map_id TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      pointer_source_cell_id TEXT NOT NULL,
      pointer_source_record_key TEXT NOT NULL,
      pointer_content_hash TEXT NOT NULL,
      pointer_cell_pool_count INTEGER NOT NULL DEFAULT 1,
      projection TEXT NOT NULL,
      source_row_content_hash TEXT NOT NULL,
      PRIMARY KEY (tenant_key, source_map_id, entry_key)
    );
    CREATE TABLE IF NOT EXISTS connection_tokens (
      token TEXT PRIMARY KEY NOT NULL,
      principal_id TEXT NOT NULL,
      intended_audience TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );
  `);
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
