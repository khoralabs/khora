import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter.ts";
import { createCatalogPostAdapter } from "./catalog-post-adapter.ts";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter.ts";
import { RelayCatalogSourceMapStore } from "./catalog-source-map-store.ts";
import { createCatalogSubscriptionAdapter } from "./catalog-subscription-adapter.ts";
import { createFrameChannelHubPersistenceSqlite } from "./frame-channel-sqlite.ts";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";

export const RELAY_CATALOG_SOURCE_PROFILE = "relay:entity:profile";
export const RELAY_CATALOG_SOURCE_TOPIC = "relay:entity:topic";

const SOURCE_PROFILE = RELAY_CATALOG_SOURCE_PROFILE;
const SOURCE_TOPIC = RELAY_CATALOG_SOURCE_TOPIC;

/** Compose relay persistence from already-open catalog + frames DBs (same catalog file as social rows). */
export function createRelayColonnadePersistenceFromDatabases(
  catalogDb: Database,
  framesDb: Database,
  tenantKey = "relay",
): AgentRelayPersistence {
  const store = new RelayCatalogSourceMapStore(catalogDb);
  return {
    frameChannelHubPersistence: createFrameChannelHubPersistenceSqlite(framesDb),
    profiles: createCatalogEntityAdapter(store, catalogDb, tenantKey, SOURCE_PROFILE),
    topics: createCatalogEntityAdapter(store, catalogDb, tenantKey, SOURCE_TOPIC),
    posts: createCatalogPostAdapter(store, catalogDb, tenantKey),
    agentRegistrations: createCatalogRegistrationAdapter(store, catalogDb, tenantKey),
    agentSubjectSubscriptions: createCatalogSubscriptionAdapter(store, catalogDb, tenantKey),
  };
}

export async function createRelayColonnadePersistence(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
}): Promise<AgentRelayPersistence> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = openRelayCatalogDb(opts.catalogPath);
  const framesDb = openRelayFramesDb(opts.framesDbPath);
  return createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
}
