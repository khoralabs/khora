export const CELL_OUTBOX_META_DDL = `
    CREATE TABLE IF NOT EXISTS outbox (
      record_key TEXT PRIMARY KEY NOT NULL,
      principal_id TEXT NOT NULL,
      tenant_key TEXT NOT NULL,
      payload BLOB NOT NULL,
      metadata TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      committed_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cell_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `;

export const CELL_INBOX_DDL = `
      CREATE TABLE inbox (
        inbox_entry_id TEXT PRIMARY KEY NOT NULL,
        tenant_key TEXT NOT NULL,
        recipient_principal_id TEXT NOT NULL,
        staging BLOB NOT NULL,
        enqueued_at_ms INTEGER NOT NULL,
        correlation_id TEXT NOT NULL
      );
    `;

export const CELL_WRITE_LOG_DDL = `
      CREATE TABLE write_log (
        log_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL,
        op BLOB NOT NULL
      );
    `;

/** Full cell schema for fresh remote databases (Turso migrations). */
export const CELL_BASE_TABLES_DDL = `${CELL_OUTBOX_META_DDL}${CELL_INBOX_DDL}${CELL_WRITE_LOG_DDL}`;

export const SCHEMA_VERSION_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS _schema_version (
    version TEXT PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL
  );
`;

export const TURSO_PRAGMAS_DDL = `PRAGMA foreign_keys = ON;`;
