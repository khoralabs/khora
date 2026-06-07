import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/host-runtime";
import { normalizeUsername } from "@khoralabs/khora-contracts";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store";
import {
  RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions";
import type { SocialAgentIdentity, SocialRegisterAgentInput } from "./social-types";

export {
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions";

/**
 * Upsert profile + principal↔profile registration and username maps in one SQLite transaction.
 * Usernames are **globally** unique in the catalog (not scoped to the relay tenant on `persistence`).
 */
export function registerAgentOnColonnadePersistence(
  persistence: AgentRelayPersistence,
  catalogDb: Database,
  store: RelayCatalogProjectionStore,
  input: SocialRegisterAgentInput,
): SocialAgentIdentity {
  const username = normalizeUsername(input.username);
  const profileId = input.profileUpsert.id;

  catalogDb.transaction(() => {
    persistence.profiles.upsert(input.profileUpsert);
    persistence.agentRegistrations.upsert(input.principalId, profileId);

    const usernameHit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
      username,
    );
    if (
      usernameHit.found &&
      usernameHit.projection !== null &&
      typeof usernameHit.projection === "object"
    ) {
      const existing = (usernameHit.projection as Record<string, unknown>).principalId;
      if (typeof existing === "string" && existing !== input.principalId) {
        throw new Error(`username '${username}' is unavailable`);
      }
    }

    const principalHit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
      input.principalId,
    );
    if (
      principalHit.found &&
      principalHit.projection !== null &&
      typeof principalHit.projection === "object"
    ) {
      const prevU = (principalHit.projection as Record<string, unknown>).username;
      if (typeof prevU === "string" && prevU !== username) {
        store.deleteRow(USERNAME_INDEX_TENANT_KEY, RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL, prevU);
      }
    }

    store.upsert({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      namespace: RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
      entry_key: username,
      projection: { principalId: input.principalId },
    });
    store.upsert({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      namespace: RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
      entry_key: input.principalId,
      projection: { username },
    });
  })();
  return { principalId: input.principalId, profileId, username };
}
