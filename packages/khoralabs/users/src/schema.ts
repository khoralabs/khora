import type { Database } from "bun:sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import m001UsersSchema from "./migrations/0.0.0-1.0.0/001-users-schema";

export const usersMigrations = [m001UsersSchema];

export async function initUsersSchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  await createMigrationRunner().run(db, usersMigrations);
}

export function isUsersSchemaReady(db: Database): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`)
    .get() as { name: string } | null;
  return row !== null;
}
