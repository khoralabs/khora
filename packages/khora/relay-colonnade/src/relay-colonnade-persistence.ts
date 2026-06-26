import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type { HostEntityPersistence, HostRegistrations } from "@khoralabs/host-runtime";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter";
import { RELAY_NAMESPACE_ENTITY_PROFILE } from "./relay-id-conventions";
import { openRelayCatalogDb } from "./sqlite-setup";

/** Profile + registration persistence slices backed by the colonnade catalog DB. */
export type ColonnadeBasePersistence = {
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
};

/** Compose profile and registration persistence from an already-open catalog DB. */
export function createRelayColonnadePersistenceFromDatabases(
  catalogDb: Database,
  tenantKey = "relay",
): ColonnadeBasePersistence {
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
}): Promise<ColonnadeBasePersistence> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  return createRelayColonnadePersistenceFromDatabases(catalogDb, tenantKey);
}
