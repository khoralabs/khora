import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type {
  AgentAccountStatusPort,
  HostEntityPersistence,
  HostRegistrations,
  SocialRelationshipPersistence,
} from "@khoralabs/host-runtime";
import { createAgentAccountStatusPort } from "./agent-account-status";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { createRelayColonnadePersistenceFromDatabases } from "./relay-colonnade-persistence";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import { openRelayCatalogDb } from "./sqlite-setup";

export async function createRelayColonnadeSocial(opts: {
  catalogPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
  social: SocialRelationshipPersistence;
  agentAccountStatus: AgentAccountStatusPort;
  catalogDb: Database;
  projectionStore: RelayCatalogProjectionStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  tenantKey: string;
}> {
  const tenantKey = opts.tenantKey ?? "relay";
  const catalogDb = await openRelayCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  const principalChannelStore = new RelaySocialPrincipalChannelStore(catalogDb);
  const { profiles, registrations } = createRelayColonnadePersistenceFromDatabases(
    catalogDb,
    tenantKey,
  );
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
