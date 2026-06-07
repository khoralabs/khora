import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type { HostPersistence } from "@khoralabs/host-runtime";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter";
import { RELAY_NAMESPACE_ENTITY_PROFILE } from "./relay-id-conventions";
import { openRelayCatalogDb } from "./sqlite-setup";

export const RELAY_CATALOG_SOURCE_PROFILE = RELAY_NAMESPACE_ENTITY_PROFILE;

/** Compose host persistence from an already-open catalog DB. */
export function createRelayColonnadePersistenceFromDatabases(
  catalogDb: Database,
  tenantKey = "relay",
): HostPersistence {
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  return {
    profiles: createCatalogEntityAdapter(
      projectionStore,
      catalogDb,
      tenantKey,
      RELAY_NAMESPACE_ENTITY_PROFILE,
    ),
    registrations: createCatalogRegistrationAdapter(projectionStore, catalogDb, tenantKey),
  };
}

export async function createRelayColonnadePersistence(opts: {
  catalogPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<HostPersistence> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  return createRelayColonnadePersistenceFromDatabases(catalogDb, tenantKey);
}
