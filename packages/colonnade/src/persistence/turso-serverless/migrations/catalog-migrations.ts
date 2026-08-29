import { CATALOG_TABLES_DDL, SCHEMA_VERSION_TABLE_DDL, TURSO_PRAGMAS_DDL } from "../../core/schema";
import type { TursoClients } from "../client";
import { execMultiple, queryAll } from "../client";
import { batchWriteStatements } from "../transactions";

export const COLONNADE_CATALOG_SCHEMA_VERSION = "0.1.0";

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
  const now = Date.now();
  await execMultiple(
    db.write,
    `INSERT INTO _schema_version (version, applied_at) VALUES ('${COLONNADE_CATALOG_SCHEMA_VERSION}', ${now});`,
  );
}
