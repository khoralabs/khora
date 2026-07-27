import type { Database } from "bun:sqlite";
import type { KhoraHostPersistence } from "@khoralabs/khora-host";
import { createAgentAccountStatusPort } from "./agent-account-status";
import { createEntityAdapter } from "./entity-adapter";
import { NAMESPACE_ENTITY_PROFILE } from "./id-conventions";
import { ProjectionStore } from "./projection-store";
import { createRegistrationAdapter } from "./registration-adapter";
import { SocialPrincipalChannelStore } from "./social-principal-channel-store";
import { registerAgentOnPersistence } from "./social-registration";
import { createSocialRelationshipPersistence } from "./social-relationship-persistence";
import { openKhoraHostDb } from "./sqlite-setup";
import { createPrincipalTeardownQueue } from "./teardown-queue";
import { createUsernameIndex } from "./username-index";

export function createKhoraHostSqlitePersistence(
  hostDb: Database,
  opts?: { tenantKey?: string },
): KhoraHostPersistence {
  const tenantKey = opts?.tenantKey ?? "khora";
  const projectionStore = new ProjectionStore(hostDb);
  const principalChannelStore = new SocialPrincipalChannelStore(hostDb);

  const profiles = createEntityAdapter(
    projectionStore,
    hostDb,
    tenantKey,
    NAMESPACE_ENTITY_PROFILE,
  );
  const registrations = createRegistrationAdapter(projectionStore, hostDb, tenantKey);
  const social = createSocialRelationshipPersistence({
    projectionStore,
    principalChannelStore,
    hostDb,
    tenantKey,
  });
  const agentAccountStatus = createAgentAccountStatusPort(hostDb);
  const usernameIndex = createUsernameIndex(projectionStore);
  const teardownQueue = createPrincipalTeardownQueue(hostDb);

  const persistence: KhoraHostPersistence = {
    profiles,
    registrations,
    social,
    agentAccountStatus,
    usernameIndex,
    teardownQueue,
    registerAgent(input) {
      return registerAgentOnPersistence(persistence, hostDb, input);
    },
    phase1Unregister(principalId, profileId, nowMs) {
      hostDb.transaction(() => {
        registrations.delete(principalId, profileId);
        teardownQueue.enqueue(principalId, profileId, nowMs);
      })();
    },
  };

  return persistence;
}

export async function openKhoraHostSqlitePersistence(opts: {
  hostDbPath: string;
  tenantKey?: string;
  /** When set, encrypt host DB with SQLCipher; omit for plaintext. */
  sqlCipherKey?: string;
}): Promise<{ persistence: KhoraHostPersistence; hostDb: Database }> {
  const hostDb = await openKhoraHostDb(opts.hostDbPath, opts.sqlCipherKey);
  const persistence = createKhoraHostSqlitePersistence(hostDb, {
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
  return { persistence, hostDb };
}
