import type { Database } from "bun:sqlite";
import { initAccountsSchema } from "@khoralabs/registry-accounts";
import { initCatalogSchema } from "@khoralabs/registry-catalog";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import { getMigrations } from "better-auth/db/migration";
import type { RegistryAuthDatabase } from "./auth-config";
import { createRegistryAuth } from "./auth-config";

async function ensureAuthSchema(authDb: RegistryAuthDatabase): Promise<void> {
  const auth = createRegistryAuth({ database: authDb });
  const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(auth.options);
  if (toBeAdded.length === 0 && toBeCreated.length === 0) {
    return;
  }
  await runMigrations();
}

export async function initAuthSchema(authDb: RegistryAuthDatabase): Promise<void> {
  if ("run" in authDb && typeof authDb.run === "function") {
    (authDb as Database).run("PRAGMA foreign_keys = ON;");
  }
  await ensureAuthSchema(authDb);
}

export async function initRegistrySchema(
  registry: RegistryDatabase,
  authDb?: RegistryAuthDatabase,
): Promise<void> {
  await initCatalogSchema(registry);
  await initAccountsSchema(registry);
  if (authDb !== undefined) {
    await initAuthSchema(authDb);
  }
}
