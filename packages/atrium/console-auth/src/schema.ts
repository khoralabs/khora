import type { Database } from "bun:sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import m001BetterAuthSchema from "./migrations/0.0.0-1.0.0/001-better-auth-schema.ts";

const authMigrations = [m001BetterAuthSchema];

export async function initAuthSchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  await createMigrationRunner().run(db, authMigrations);
}
