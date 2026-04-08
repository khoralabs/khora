/** Zod helpers: {@link zId}, {@link defineTable}, {@link defineSchema}, {@link documentValidator}. */

export { jsonOrNull, stableId } from "./db";
export {
  defineSchema,
  defineTable,
  documentValidator,
  type ZIdMeta,
  zId,
} from "./define-schema";
/** Runtime checks against `PRAGMA` / manifest parity. */
export {
  assertRelationalSchemaExtractParity,
  assertSqliteDatabaseMatchesSchema,
} from "./sqlite-assert";
/** SQLite DDL + relational manifest from Zod table schemas. */
export {
  extractRelationalSchema,
  type ForeignKeySpec,
  quoteIdent,
  type RelationalSchemaManifest,
  sqliteDdlFromSchema,
  type TableColumnShape,
} from "./sqlite-relational";
