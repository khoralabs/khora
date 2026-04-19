import type { Database } from "bun:sqlite";
import { documentValidator } from "@cfd/memories-core/persistence";
import type z from "zod";
import { extractRelationalSchema, quoteIdent } from "./sqlite-relational";

type PragmaTableInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

type PragmaFk = {
  table: string;
  from: string;
  to: string;
  on_delete: string;
};

/**
 * Throws if any {@link documentValidator} table shape’s field names differ from {@link extractRelationalSchema}.
 */
export function assertRelationalSchemaExtractParity<
  S extends z.ZodObject<Record<string, z.ZodObject>>,
>(schema: S): void {
  const manifest = extractRelationalSchema(schema);
  for (const tableName of manifest.tableNames) {
    const doc = documentValidator(schema, tableName as keyof S["shape"] & string);
    const zKeys = Object.keys(doc.shape).sort();
    const mCols = (manifest.columnsByTable[tableName] ?? []).map((c) => c.name).sort();
    if (zKeys.join("\0") !== mCols.join("\0")) {
      throw new Error(
        `${tableName}: Zod fields !== extracted SQLite columns.\n  zod: ${zKeys.join(", ")}\n  extract: ${mCols.join(", ")}`,
      );
    }
  }
}

/**
 * Throws if the database tables/columns/nullability/PK/FKs do not match {@link extractRelationalSchema}.
 */
export function assertSqliteDatabaseMatchesSchema<
  S extends z.ZodObject<Record<string, z.ZodObject>>,
>(db: Database, schema: S): void {
  const manifest = extractRelationalSchema(schema);
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => r.name);

  const expectedTables = [...manifest.tableNames].sort();
  const gotTables = [...tables].sort();
  if (expectedTables.join("\0") !== gotTables.join("\0")) {
    throw new Error(
      `Table list mismatch.\n  expected: ${expectedTables.join(", ")}\n  got: ${gotTables.join(", ")}`,
    );
  }

  for (const tableName of manifest.tableNames) {
    const cols = manifest.columnsByTable[tableName];
    if (cols === undefined) throw new Error(`Missing columns for ${tableName}`);
    const rows = db.query<PragmaTableInfo, []>(`PRAGMA table_info(${quoteIdent(tableName)})`).all();
    const byName = new Map(rows.map((r) => [r.name, r]));
    if (byName.size !== cols.length) {
      throw new Error(
        `${tableName}: column count mismatch (expected ${cols.length}, got ${byName.size})`,
      );
    }
    for (const c of cols) {
      const row = byName.get(c.name);
      if (row === undefined) throw new Error(`${tableName}: missing column ${c.name}`);
      if (row.type.toUpperCase() !== c.sqliteAffinity) {
        throw new Error(
          `${tableName}.${c.name}: type mismatch (expected ${c.sqliteAffinity}, got ${row.type})`,
        );
      }
      const wantNull = c.notNull ? 1 : 0;
      if (row.notnull !== wantNull) {
        throw new Error(
          `${tableName}.${c.name}: NOT NULL mismatch (expected ${c.notNull}, pragma notnull=${row.notnull})`,
        );
      }
      const wantPk = c.primaryKey ? 1 : 0;
      if (row.pk !== wantPk) {
        throw new Error(
          `${tableName}.${c.name}: PRIMARY KEY mismatch (expected pk=${wantPk}, got ${row.pk})`,
        );
      }
    }

    const fkRows = db
      .query<PragmaFk, []>(`PRAGMA foreign_key_list(${quoteIdent(tableName)})`)
      .all();
    const expectedFks = manifest.foreignKeys.filter((fk) => fk.fromTable === tableName);
    if (fkRows.length !== expectedFks.length) {
      throw new Error(
        `${tableName}: FK count mismatch (expected ${expectedFks.length}, got ${fkRows.length})`,
      );
    }
    const gotSet = new Set(fkRows.map((r) => `${r.from}->${r.table}.${r.to}|${r.on_delete}`));
    for (const fk of expectedFks) {
      const entry = `${fk.fromColumn}->${fk.referencesTable}.${fk.referencesColumn}|CASCADE`;
      if (!gotSet.has(entry)) {
        throw new Error(
          `${tableName}: missing or wrong FK ${fk.fromColumn}->${fk.referencesTable}.${fk.referencesColumn} (have: ${[...gotSet].join("; ")})`,
        );
      }
    }
  }
}
