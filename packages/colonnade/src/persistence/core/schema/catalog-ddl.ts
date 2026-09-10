export const CATALOG_TABLES_DDL = `
    CREATE TABLE IF NOT EXISTS discovery_documents (
      document_key TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_pointers (
      catalog_pointer_id TEXT PRIMARY KEY NOT NULL,
      tenant_key TEXT NOT NULL,
      publication_key TEXT NOT NULL,
      publisher_principal_id TEXT NOT NULL,
      published_at_ms INTEGER NOT NULL,
      locator_cell_id TEXT NOT NULL,
      locator_record_key TEXT NOT NULL,
      locator_cell_pool_count INTEGER NOT NULL DEFAULT 1,
      content_hash TEXT NOT NULL,
      projection TEXT NOT NULL,
      UNIQUE(tenant_key, publication_key)
    );
    CREATE TABLE IF NOT EXISTS catalog_pointer_tags (
      tenant_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      published_at_ms INTEGER NOT NULL,
      catalog_pointer_id TEXT NOT NULL,
      PRIMARY KEY (tenant_key, tag, published_at_ms, catalog_pointer_id)
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
  `;

/** Feed indexes — applied after column migrations so legacy DBs upgrade safely. */
export const CATALOG_FEED_INDEXES_DDL = `
    CREATE INDEX IF NOT EXISTS catalog_pointers_tenant_feed
      ON catalog_pointers(tenant_key, published_at_ms DESC, catalog_pointer_id DESC);
    CREATE INDEX IF NOT EXISTS catalog_pointers_tenant_publisher_feed
      ON catalog_pointers(tenant_key, publisher_principal_id, published_at_ms DESC, catalog_pointer_id DESC);
    CREATE INDEX IF NOT EXISTS catalog_pointer_tags_tag_feed
      ON catalog_pointer_tags(tenant_key, tag, published_at_ms DESC, catalog_pointer_id DESC);
  `;
