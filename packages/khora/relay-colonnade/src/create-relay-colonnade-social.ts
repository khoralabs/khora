import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { EncryptionKeyProvider } from "@khoralabs/sqlite-crypto";
import { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence.ts";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store.ts";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
import type { SocialRelationshipPersistence } from "./social-types.ts";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";

export async function createRelayColonnadeSocial(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{
  persistence: AgentRelayPersistence;
  social: SocialRelationshipPersistence;
  catalogDb: Database;
  framesDb: Database;
  projectionStore: RelayCatalogProjectionStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  tenantKey: string;
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const framesDb = await openRelayFramesDb(opts.framesDbPath, opts.encryptionProvider);
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
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
    principalChannelStore,
    tenantKey,
  };
}
