import {
  CATALOG_FEED_INDEXES_DDL,
  CATALOG_TABLES_DDL,
  SCHEMA_VERSION_TABLE_DDL,
  TURSO_PRAGMAS_DDL,
} from "../../core/schema";
import type { TursoClients } from "../client";
import { execMultiple, execSql, queryAll } from "../client";
import { batchWriteStatements } from "../transactions";

export const COLONNADE_CATALOG_SCHEMA_VERSION = "0.2.0";
const LEGACY_CATALOG_SCHEMA_VERSION = "0.1.0";

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function listAppliedSchemaVersions(db: TursoClients): Promise<string[]> {
  try {
    const rows = await queryAll<{ version: string }>(
      db.read,
      `SELECT version FROM _schema_version ORDER BY applied_at ASC`,
    );
    return rows.map((r) => r.version);
  } catch {
    return [];
  }
}

async function tableColumns(db: TursoClients, table: string): Promise<Set<string>> {
  try {
    const rows = await queryAll<{ name: string }>(db.read, `PRAGMA table_info(${table})`);
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

async function migrateCatalogTimelineColumns(db: TursoClients): Promise<void> {
  const pointerCols = await tableColumns(db, "catalog_pointers");
  if (pointerCols.size > 0) {
    if (!pointerCols.has("locator_cell_pool_count")) {
      await execSql(
        db.write,
        "ALTER TABLE catalog_pointers ADD COLUMN locator_cell_pool_count INTEGER NOT NULL DEFAULT 1",
      );
    }
    if (!pointerCols.has("tenant_key")) {
      await execSql(
        db.write,
        "ALTER TABLE catalog_pointers ADD COLUMN tenant_key TEXT NOT NULL DEFAULT ''",
      );
    }
    if (!pointerCols.has("publication_key")) {
      await execSql(
        db.write,
        "ALTER TABLE catalog_pointers ADD COLUMN publication_key TEXT NOT NULL DEFAULT ''",
      );
    }
    if (!pointerCols.has("publisher_principal_id")) {
      await execSql(
        db.write,
        "ALTER TABLE catalog_pointers ADD COLUMN publisher_principal_id TEXT NOT NULL DEFAULT ''",
      );
    }
    if (!pointerCols.has("published_at_ms")) {
      await execSql(
        db.write,
        "ALTER TABLE catalog_pointers ADD COLUMN published_at_ms INTEGER NOT NULL DEFAULT 0",
      );
    }
    await execSql(
      db.write,
      `UPDATE catalog_pointers SET publication_key = catalog_pointer_id
       WHERE publication_key = '' OR publication_key IS NULL`,
    );
    await execSql(
      db.write,
      `CREATE UNIQUE INDEX IF NOT EXISTS catalog_pointers_tenant_publication
       ON catalog_pointers(tenant_key, publication_key)`,
    );
  }

  await execSql(
    db.write,
    `CREATE TABLE IF NOT EXISTS catalog_pointer_tags (
      tenant_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      published_at_ms INTEGER NOT NULL,
      catalog_pointer_id TEXT NOT NULL,
      PRIMARY KEY (tenant_key, tag, published_at_ms, catalog_pointer_id)
    )`,
  );

  const mapCols = await tableColumns(db, "source_map_rows");
  if (mapCols.size > 0 && !mapCols.has("pointer_cell_pool_count")) {
    await execSql(
      db.write,
      "ALTER TABLE source_map_rows ADD COLUMN pointer_cell_pool_count INTEGER NOT NULL DEFAULT 1",
    );
  }
}

export async function migrateCatalogTursoServerless(db: TursoClients): Promise<void> {
  const applied = new Set(await listAppliedSchemaVersions(db));
  if (applied.has(COLONNADE_CATALOG_SCHEMA_VERSION)) {
    return;
  }

  const stmts = [
    ...splitStatements(TURSO_PRAGMAS_DDL),
    ...splitStatements(SCHEMA_VERSION_TABLE_DDL),
    ...splitStatements(CATALOG_TABLES_DDL),
  ];
  await batchWriteStatements(db.batch, stmts);
  await migrateCatalogTimelineColumns(db);
  await batchWriteStatements(db.batch, splitStatements(CATALOG_FEED_INDEXES_DDL));

  const now = Date.now();
  if (!applied.has(LEGACY_CATALOG_SCHEMA_VERSION)) {
    await execMultiple(
      db.write,
      `INSERT INTO _schema_version (version, applied_at) VALUES ('${LEGACY_CATALOG_SCHEMA_VERSION}', ${now});`,
    );
  }
  await execMultiple(
    db.write,
    `INSERT INTO _schema_version (version, applied_at) VALUES ('${COLONNADE_CATALOG_SCHEMA_VERSION}', ${now});`,
  );
}
