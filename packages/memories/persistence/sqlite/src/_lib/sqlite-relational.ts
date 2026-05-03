import { documentValidator, type ZIdMeta } from "@cfd/memories-core/persistence";
import type z from "zod";

function zodDef(t: z.ZodType): { type?: string; format?: string; check?: string } | undefined {
  const zt = t as { _zod?: { def?: object }; def?: object };
  return (zt._zod?.def ?? zt.def) as { type?: string; format?: string; check?: string } | undefined;
}

function readZodMeta(t: z.ZodType): unknown {
  return (t as { meta?: () => unknown }).meta?.();
}

function idRefFromSchema(t: z.ZodType): string | undefined {
  const m = readZodMeta(t);
  if (m && typeof m === "object" && m !== null && "idRef" in m) {
    return String((m as ZIdMeta).idRef);
  }
  return undefined;
}

type ZodInnerDef = { type?: string; innerType?: z.ZodType };

function zodInnerDef(t: z.ZodType): ZodInnerDef | undefined {
  return (t as { _zod?: { def?: ZodInnerDef } })._zod?.def;
}

/** Peel Zod `optional` / `nullable` wrappers (Zod 4 uses `_zod.def.innerType`). */
function unwrapOptionalChains(t: z.ZodType): { inner: z.ZodType; allowsNull: boolean } {
  let inner = t;
  let allowsNull = false;
  while (true) {
    const def = zodInnerDef(inner);
    if (def?.type === "optional" && def.innerType !== undefined) {
      allowsNull = true;
      inner = def.innerType;
      continue;
    }
    if (def?.type === "nullable" && def.innerType !== undefined) {
      allowsNull = true;
      inner = def.innerType;
      continue;
    }
    break;
  }
  return { inner, allowsNull };
}

export type ForeignKeySpec = Readonly<{
  fromTable: string;
  fromColumn: string;
  referencesTable: string;
  referencesColumn: "_id";
}>;

export type TableColumnShape = Readonly<{
  name: string;
  sqliteAffinity: "TEXT" | "REAL" | "BLOB";
  notNull: boolean;
  primaryKey: boolean;
  foreignKey: ForeignKeySpec | null;
}>;

export type RelationalSchemaManifest = Readonly<{
  tableNames: readonly string[];
  foreignKeys: readonly ForeignKeySpec[];
  columnsByTable: Readonly<Record<string, readonly TableColumnShape[]>>;
}>;

type ResolvedCol =
  | { kind: "pk" }
  | { kind: "fk"; refTable: string }
  | { kind: "plain"; affinity: "TEXT" | "REAL" | "BLOB"; notNull: boolean };

function resolveColumn(tableName: string, columnName: string, field: z.ZodType): ResolvedCol {
  const { inner, allowsNull } = unwrapOptionalChains(field);
  const idRef = idRefFromSchema(inner);
  if (idRef !== undefined) {
    if (columnName === "_id" && idRef === tableName) {
      return { kind: "pk" };
    }
    return { kind: "fk", refTable: idRef };
  }
  const def = zodDef(inner);
  const ty = def?.type;
  if (ty === "enum") {
    return { kind: "plain", affinity: "TEXT", notNull: !allowsNull };
  }
  if (ty === "string") {
    return { kind: "plain", affinity: "TEXT", notNull: !allowsNull };
  }
  if (ty === "number") {
    return { kind: "plain", affinity: "REAL", notNull: true };
  }
  if (ty === "array") {
    const el = (inner as { element?: z.ZodType }).element;
    if (el === undefined) {
      throw new TypeError(`${tableName}.${columnName}: array schema missing element type`);
    }
    const elDef = zodDef(el);
    const float32 =
      elDef?.type === "number" && (elDef.format === "float32" || elDef.check === "number_format");
    if (!float32) {
      throw new TypeError(
        `${tableName}.${columnName}: only float32[] arrays are supported for SQLite`,
      );
    }
    return { kind: "plain", affinity: "BLOB", notNull: !allowsNull };
  }
  if (ty === "record") {
    return { kind: "plain", affinity: "TEXT", notNull: !allowsNull };
  }
  throw new TypeError(`${tableName}.${columnName}: unsupported Zod type for SQLite (${ty ?? "?"})`);
}

function columnShape(
  tableName: string,
  columnName: string,
  field: z.ZodType,
): { shape: TableColumnShape; fk?: ForeignKeySpec } {
  const r = resolveColumn(tableName, columnName, field);
  if (r.kind === "pk") {
    return {
      shape: {
        name: columnName,
        sqliteAffinity: "TEXT",
        notNull: true,
        primaryKey: true,
        foreignKey: null,
      },
    };
  }
  if (r.kind === "fk") {
    const { allowsNull } = unwrapOptionalChains(field);
    const fk: ForeignKeySpec = {
      fromTable: tableName,
      fromColumn: columnName,
      referencesTable: r.refTable,
      referencesColumn: "_id",
    };
    return {
      shape: {
        name: columnName,
        sqliteAffinity: "TEXT",
        notNull: !allowsNull,
        primaryKey: false,
        foreignKey: fk,
      },
      fk,
    };
  }
  return {
    shape: {
      name: columnName,
      sqliteAffinity: r.affinity,
      notNull: r.notNull,
      primaryKey: false,
      foreignKey: null,
    },
  };
}

/**
 * Table names (sorted), foreign keys from {@link zId} metadata, and per-column SQLite shapes.
 * Uses `readonly` / `Object.freeze` for stable runtime literals.
 */
export function extractRelationalSchema<S extends z.ZodObject<Record<string, z.ZodObject>>>(
  schema: S,
): RelationalSchemaManifest {
  const tableNames = Object.keys(schema.shape).sort() as readonly string[];
  const columnsByTable: Record<string, TableColumnShape[]> = {};
  const foreignKeys: ForeignKeySpec[] = [];

  for (const tableName of tableNames) {
    const doc = documentValidator(schema, tableName as keyof S["shape"] & string);
    const cols: TableColumnShape[] = [];
    for (const columnName of Object.keys(doc.shape)) {
      const field = doc.shape[columnName as keyof typeof doc.shape];
      if (field === undefined) continue;
      const { shape, fk } = columnShape(tableName, columnName, field);
      cols.push(shape);
      if (fk !== undefined) foreignKeys.push(fk);
    }
    columnsByTable[tableName] = cols;
  }

  return Object.freeze({
    tableNames: Object.freeze(tableNames),
    foreignKeys: Object.freeze(foreignKeys.slice()) as readonly ForeignKeySpec[],
    columnsByTable: Object.freeze(columnsByTable) as Readonly<
      Record<string, readonly TableColumnShape[]>
    >,
  });
}

function topologicalTableOrder(manifest: RelationalSchemaManifest): readonly string[] {
  const names = [...manifest.tableNames];
  /** Tables that must exist before `t` (referenced via FK). */
  const needs = new Map<string, Set<string>>();
  for (const t of names) needs.set(t, new Set());
  for (const fk of manifest.foreignKeys) {
    needs.get(fk.fromTable)?.add(fk.referencesTable);
  }
  const out: string[] = [];
  const pending = new Set(names);
  while (pending.size > 0) {
    let progress = false;
    for (const t of [...pending]) {
      const need = needs.get(t) ?? new Set<string>();
      const unsatisfied = [...need].filter((x) => !out.includes(x));
      if (unsatisfied.length === 0) {
        out.push(t);
        pending.delete(t);
        progress = true;
      }
    }
    if (!progress) {
      throw new Error(
        `Cannot resolve table creation order (cycle or missing ref?): ${[...pending].join(", ")}`,
      );
    }
  }
  return out;
}

function columnDdlLine(c: TableColumnShape): string {
  const { name, sqliteAffinity, notNull, primaryKey, foreignKey } = c;
  if (primaryKey) {
    return `${quoteIdent(name)} ${sqliteAffinity} PRIMARY KEY NOT NULL`;
  }
  let line = `${quoteIdent(name)} ${sqliteAffinity}`;
  if (notNull) line += " NOT NULL";
  if (foreignKey) {
    line += ` REFERENCES ${quoteIdent(foreignKey.referencesTable)} (${quoteIdent(foreignKey.referencesColumn)}) ON DELETE CASCADE`;
  }
  return line;
}

/** Escape double-quotes for SQLite identifiers (used in DDL and PRAGMA). */
export function quoteIdent(id: string): string {
  return `"${id.replaceAll('"', '""')}"`;
}

/**
 * `CREATE TABLE` / `CREATE INDEX` DDL aligned with {@link extractRelationalSchema}.
 */
export function sqliteDdlFromSchema<S extends z.ZodObject<Record<string, z.ZodObject>>>(
  schema: S,
): string {
  const manifest = extractRelationalSchema(schema);
  const order = topologicalTableOrder(manifest);
  const parts: string[] = [];
  for (const tableName of order) {
    const cols = manifest.columnsByTable[tableName];
    if (cols === undefined) continue;
    const body = cols.map(columnDdlLine).join(",\n  ");
    parts.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n  ${body}\n);`);
  }
  for (const fk of manifest.foreignKeys) {
    const idx = `idx_${fk.fromTable}_${fk.fromColumn}`;
    parts.push(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(idx)} ON ${quoteIdent(fk.fromTable)} (${quoteIdent(fk.fromColumn)});`,
    );
  }
  return parts.join("\n\n");
}
