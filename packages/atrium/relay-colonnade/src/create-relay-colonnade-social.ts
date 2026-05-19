import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { SqliteCatalogPersistenceStrategy } from "@khoralabs/colonnade-persistence";
import { RelayCatalogSourceMapStore } from "./catalog-source-map-store.ts";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence.ts";
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
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogStrategy: SqliteCatalogPersistenceStrategy;
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const { db: catalogDb, catalogStrategy } = openRelayCatalogDb(opts.catalogPath);
  const framesDb = openRelayFramesDb(opts.framesDbPath);
  const store = new RelayCatalogSourceMapStore(catalogDb);
  const persistence = createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
  const social = createSocialRelationshipPersistence({ store, catalogDb, framesDb, tenantKey });
  return { persistence, social, catalogDb, framesDb, store, tenantKey, catalogStrategy };
}
