import type { Database } from "bun:sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import m001Initial from "./migrations/0.0.0-0.1.0/001-initial.ts";
import m001Subjects from "./migrations/0.1.0-0.2.0/001-subjects.ts";
import { configureSwarmHostSqlitePragmas } from "./schema.ts";

const migrations = [m001Initial, m001Subjects];

/**
 * Applies Atrium host DDL migrations. Uses a dedicated tracking table so this never collides with
 * {@link initMemoriesSchema} / `openMemoriesDatabase`, which also records `0.0.0→0.1.0` / `001-initial`
 * rows in the default `_schema_migrations` table on the same file.
 */
export function migrateAtriumHostDb(db: Database): void {
  configureSwarmHostSqlitePragmas(db);
  createMigrationRunner({ tableName: "atrium_host_schema_migrations" }).runSync(db, migrations);
}
