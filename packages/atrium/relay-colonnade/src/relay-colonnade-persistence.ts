import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter.ts";
import { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter.ts";
import { createCatalogSubscriptionAdapter } from "./catalog-subscription-adapter.ts";
import { createFrameChannelHubPersistenceSqlite } from "./frame-channel-sqlite.ts";
import {
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_ENTITY_TOPIC,
} from "./relay-id-conventions.ts";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";

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
    agentSubjectSubscriptions: createCatalogSubscriptionAdapter(
      projectionStore,
      catalogDb,
      tenantKey,
    ),
  };
}

export async function createRelayColonnadePersistence(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
}): Promise<AgentRelayPersistence> {
  const tenantKey = opts.tenantKey ?? "relay";
  const { db: catalogDb } = openRelayCatalogDb(opts.catalogPath);
  const framesDb = openRelayFramesDb(opts.framesDbPath);
  return createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
}
