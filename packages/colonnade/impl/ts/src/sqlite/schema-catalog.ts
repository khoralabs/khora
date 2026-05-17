import type { Database } from "bun:sqlite";

export function ensureCatalogSchema(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS principal_home_cell`);
  db.exec(`DROP TABLE IF EXISTS catalog_meta`);

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
}
