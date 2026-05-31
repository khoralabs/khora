import type { Database } from "bun:sqlite";
import { USERS_SCHEMA_SQL } from "./schema-sql";

export async function initUsersSchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(USERS_SCHEMA_SQL);
}
