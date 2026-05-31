import type { Database } from "bun:sqlite";
import { initUsersSchema } from "@khoralabs/users";
import { getMigrations } from "better-auth/db/migration";
import { createRegistryAuth } from "./auth-config";

async function ensureAuthSchema(): Promise<void> {
  const auth = createRegistryAuth();
  const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(auth.options);
  if (toBeAdded.length === 0 && toBeCreated.length === 0) {
    return;
  }
  await runMigrations();
}

export async function initAuthSchema(db: Database): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON;");
  await ensureAuthSchema();
}

export async function initRegistrySchema(db: Database): Promise<void> {
  await initUsersSchema(db);
  await ensureAuthSchema();
}
