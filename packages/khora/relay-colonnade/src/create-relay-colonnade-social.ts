import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type { HostPersistence } from "@khoralabs/host-runtime";
import type { FrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay";
import { createSqliteFrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay-sqlite";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import type { SocialRelationshipPersistence } from "./social-types";
import { openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup";

export async function createRelayColonnadeSocial(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{
  persistence: HostPersistence;
  frameRelayStore: FrameRelayStoreStrategy;
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
  const frameRelayStore = createSqliteFrameRelayStoreStrategy(framesDb);
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  const principalChannelStore = new RelaySocialPrincipalChannelStore(catalogDb);
  const persistence = createRelayColonnadePersistenceFromDatabases(catalogDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    catalogDb,
    frameRelayStore,
    tenantKey,
  });
  return {
    persistence,
    frameRelayStore,
    social,
    catalogDb,
    framesDb,
    projectionStore,
    principalChannelStore,
    tenantKey,
  };
}
