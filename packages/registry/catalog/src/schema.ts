import type { Database } from "bun:sqlite";
import { USERS_SCHEMA_SQL } from "./schema-sql";

export async function initCatalogSchema(db: Database): Promise<void> {
  db.run("PRAGMA foreign_keys = ON;");
  db.run(USERS_SCHEMA_SQL);
}
