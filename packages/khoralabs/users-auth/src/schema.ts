import type { Database } from "bun:sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import { usersMigrations } from "@khoralabs/users";
import m001BetterAuthSchema from "./migrations/1.0.0-2.0.0/001-better-auth-schema";

export const authMigrations = [m001BetterAuthSchema];
export const registryMigrations = [...usersMigrations, ...authMigrations];

export async function initAuthSchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  await createMigrationRunner().run(db, authMigrations);
}

export async function initRegistrySchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  await createMigrationRunner().run(db, registryMigrations);
}

export function isAuthSchemaReady(db: Database): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verification'`)
    .get() as { name: string } | null;
  return row !== null;
}
