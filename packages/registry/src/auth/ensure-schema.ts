import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { RegistryAuthDatabase } from "./auth-config";
import { initRegistrySchema } from "./schema";

export type RegistryBootstrapStore = {
  registry: RegistryDatabase;
  authDatabase: RegistryAuthDatabase;
};

/** Ensure domain + Better Auth tables exist. Prefer injecting the store from app bootstrap. */
export async function ensureRegistrySchema(store?: RegistryBootstrapStore): Promise<void> {
  if (store !== undefined) {
    await initRegistrySchema(store.registry, store.authDatabase);
    return;
  }
  // Test helper fallback: open the default sqlite singleton.
  const { getRegistrySqliteBundle } = await import("@khoralabs/registry/sqlite");
  const { db, registry } = getRegistrySqliteBundle();
  await initRegistrySchema(registry, db);
}
