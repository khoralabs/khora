import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import {
  createRelayColonnadePersistenceFromDatabases,
} from "./relay-colonnade-persistence.ts";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";
import { RelayCatalogSourceMapStore } from "./catalog-source-map-store.ts";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
import type { SocialRelationshipPersistence } from "./social-types.ts";

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
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = openRelayCatalogDb(opts.catalogPath);
  const framesDb = openRelayFramesDb(opts.framesDbPath);
  const store = new RelayCatalogSourceMapStore(catalogDb);
  const persistence = createRelayColonnadePersistenceFromDatabases(catalogDb, framesDb, tenantKey);
  const social = createSocialRelationshipPersistence({ store, catalogDb, tenantKey });
  return { persistence, social, catalogDb, framesDb, store, tenantKey };
}
