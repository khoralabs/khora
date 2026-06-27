import type { Database } from "bun:sqlite";
import type { EncryptionKeyProvider } from "@khoralabs/colonnade-crypto";
import type { KhoraHostPersistence } from "@khoralabs/khora-host";
import { createAgentAccountStatusPort } from "./agent-account-status";
import { createCatalogEntityAdapter } from "./catalog-entity-adapter";
import { CatalogProjectionStore } from "./catalog-projection-store";
import { createCatalogRegistrationAdapter } from "./catalog-registration-adapter";
import { NAMESPACE_ENTITY_PROFILE } from "./id-conventions";
import { SocialPrincipalChannelStore } from "./social-principal-channel-store";
import { registerAgentOnPersistence } from "./social-registration";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import { openKhoraCatalogDb } from "./sqlite-setup";
import { createPrincipalTeardownQueue } from "./teardown-queue";
import { createUsernameIndex } from "./username-index";

export function buildKhoraHostPersistence(
  catalogDb: Database,
  tenantKey = "khora",
): KhoraHostPersistence {
  const projectionStore = new CatalogProjectionStore(catalogDb);
  const principalChannelStore = new SocialPrincipalChannelStore(catalogDb);

  const profiles = createCatalogEntityAdapter(
    projectionStore,
    catalogDb,
    tenantKey,
    NAMESPACE_ENTITY_PROFILE,
  );
  const registrations = createCatalogRegistrationAdapter(projectionStore, catalogDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    catalogDb,
    tenantKey,
  });
  const agentAccountStatus = createAgentAccountStatusPort(catalogDb);
  const usernameIndex = createUsernameIndex(projectionStore);
  const teardownQueue = createPrincipalTeardownQueue(catalogDb);

  const persistence: KhoraHostPersistence = {
    profiles,
    registrations,
    social,
    agentAccountStatus,
    usernameIndex,
    teardownQueue,
    registerAgent(input) {
      return registerAgentOnPersistence(persistence, catalogDb, input);
    },
    phase1Unregister(principalId, profileId, nowMs) {
      catalogDb.transaction(() => {
        registrations.delete(principalId, profileId);
        teardownQueue.enqueue(principalId, profileId, nowMs);
      })();
    },
  };

  return persistence;
}

export async function openKhoraHostPersistence(opts: {
  catalogPath: string;
  tenantKey?: string;
  encryptionProvider: EncryptionKeyProvider;
}): Promise<{ persistence: KhoraHostPersistence; catalogDb: Database }> {
  const tenantKey = opts.tenantKey ?? "khora";
  const catalogDb = await openKhoraCatalogDb(opts.catalogPath, opts.encryptionProvider);
  const persistence = buildKhoraHostPersistence(catalogDb, tenantKey);
  return { persistence, catalogDb };
}
