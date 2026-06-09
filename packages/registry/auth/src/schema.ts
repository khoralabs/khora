import type { Database } from "bun:sqlite";
import { initAccountsSchema } from "@khoralabs/registry-accounts";
import { initCatalogSchema } from "@khoralabs/registry-catalog";
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
  db.run("PRAGMA foreign_keys = ON;");
  await ensureAuthSchema();
}

export async function initRegistrySchema(db: Database): Promise<void> {
  await initCatalogSchema(db);
  await initAccountsSchema(db);
  await initAuthSchema(db);
}
