import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type {
  AgentAccountStatusPort,
  HostEntityPersistence,
  HostRegistrations,
  SocialRelationshipPersistence,
} from "@khoralabs/host-runtime";
import { createAgentAccountStatusPort } from "./agent-account-status";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter";
import { CatalogProjectionStore } from "./catalog-projection-store";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter";
import { NAMESPACE_ENTITY_PROFILE } from "./id-conventions";
import { SocialPrincipalChannelStore } from "./social-principal-channel-store";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import { openKhoraCatalogDb } from "./sqlite-setup";

export type ColonnadeBasePersistence = {
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
};

export function createKhoraPersistenceFromDatabases(
  catalogDb: Database,
  tenantKey = "khora",
): ColonnadeBasePersistence & {
  projectionStore: CatalogProjectionStore;
} {
  const projectionStore = new CatalogProjectionStore(catalogDb);
  return {
    projectionStore,
    profiles: createCatalogEntityAdapter(
      projectionStore,
      catalogDb,
      tenantKey,
      NAMESPACE_ENTITY_PROFILE,
    ),
    registrations: createCatalogRegistrationAdapter(projectionStore, catalogDb, tenantKey),
  };
}

export async function createKhoraSocial(opts: {
  catalogPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
  social: SocialRelationshipPersistence;
  agentAccountStatus: AgentAccountStatusPort;
  catalogDb: Database;
  projectionStore: CatalogProjectionStore;
  principalChannelStore: SocialPrincipalChannelStore;
  tenantKey: string;
}> {
  const tenantKey = opts.tenantKey ?? "khora";
  const catalogDb = await openKhoraCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const projectionStore = new CatalogProjectionStore(catalogDb);
  const principalChannelStore = new SocialPrincipalChannelStore(catalogDb);
  const { profiles, registrations } = createKhoraPersistenceFromDatabases(catalogDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    catalogDb,
    tenantKey,
  });
  const agentAccountStatus = createAgentAccountStatusPort(catalogDb);
  return {
    profiles,
    registrations,
    social,
    agentAccountStatus,
    catalogDb,
    projectionStore,
    principalChannelStore,
    tenantKey,
  };
}
