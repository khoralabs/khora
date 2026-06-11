import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type { HostPersistence } from "@khoralabs/host-runtime";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import type { SocialRelationshipPersistence } from "./social-types";
import { openRelayCatalogDb } from "./sqlite-setup";

export async function createRelayColonnadeSocial(opts: {
  catalogPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{
  persistence: HostPersistence;
  social: SocialRelationshipPersistence;
  catalogDb: Database;
  projectionStore: RelayCatalogProjectionStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  tenantKey: string;
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  const principalChannelStore = new RelaySocialPrincipalChannelStore(catalogDb);
  const persistence = createRelayColonnadePersistenceFromDatabases(catalogDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    catalogDb,
    tenantKey,
  });
  return {
    persistence,
    social,
    catalogDb,
    projectionStore,
    principalChannelStore,
    tenantKey,
  };
}
