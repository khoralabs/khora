import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { SqliteCatalogPersistenceStrategy } from "@khoralabs/colonnade-persistence";
import { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence.ts";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store.ts";
import { RelaySubscriptionEdgeStore } from "./relay-subscription-edge-store.ts";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
import type { SocialRelationshipPersistence } from "./social-types.ts";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";

export async function createRelayColonnadeSocial(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
}): Promise<{
  persistence: AgentRelayPersistence;
  social: SocialRelationshipPersistence;
  catalogDb: Database;
  framesDb: Database;
  projectionStore: RelayCatalogProjectionStore;
  subscriptionEdgeStore: RelaySubscriptionEdgeStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  tenantKey: string;
  catalogStrategy: SqliteCatalogPersistenceStrategy;
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const { db: catalogDb, catalogStrategy } = openRelayCatalogDb(opts.catalogPath);
  const framesDb = openRelayFramesDb(opts.framesDbPath);
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  const subscriptionEdgeStore = new RelaySubscriptionEdgeStore(catalogDb);
  const principalChannelStore = new RelaySocialPrincipalChannelStore(catalogDb);
  const persistence = createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    catalogDb,
    framesDb,
    tenantKey,
  });
  return {
    persistence,
    social,
    catalogDb,
    framesDb,
    projectionStore,
    subscriptionEdgeStore,
    principalChannelStore,
    tenantKey,
    catalogStrategy,
  };
}
