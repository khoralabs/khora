import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { EncryptionKeyProvider } from "@khoralabs/sqlite-crypto";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter";
import { createFrameChannelHubPersistenceSqlite } from "./frame-channel-sqlite";
import {
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_ENTITY_TOPIC,
} from "./relay-id-conventions";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup";

export const RELAY_CATALOG_SOURCE_PROFILE = RELAY_NAMESPACE_ENTITY_PROFILE;
export const RELAY_CATALOG_SOURCE_TOPIC = RELAY_NAMESPACE_ENTITY_TOPIC;

/** Compose relay persistence from already-open catalog + frames DBs. */
export function createRelayColonnadePersistenceFromDatabases(
  catalogDb: Database,
  framesDb: Database,
  tenantKey = "relay",
): AgentRelayPersistence {
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  return {
    frameChannelHubPersistence: createFrameChannelHubPersistenceSqlite(framesDb),
    profiles: createCatalogEntityAdapter(
      projectionStore,
      catalogDb,
      tenantKey,
      RELAY_NAMESPACE_ENTITY_PROFILE,
    ),
    topics: createCatalogEntityAdapter(
      projectionStore,
      catalogDb,
      tenantKey,
      RELAY_NAMESPACE_ENTITY_TOPIC,
    ),
    agentRegistrations: createCatalogRegistrationAdapter(projectionStore, catalogDb, tenantKey),
  };
}

export async function createRelayColonnadePersistence(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<AgentRelayPersistence> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const framesDb = await openRelayFramesDb(opts.framesDbPath, opts.encryptionProvider);
  return createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
}
