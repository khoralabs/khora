import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { type RelayCatalogSourceMapStore, relaySyntheticPointer } from "@khoralabs/relay-colonnade";
import { normalizeUsername } from "@khoralabs/at2-contracts";
import type { SocialAgentIdentity, SocialRegisterAgentInput } from "./social-types.ts";

const SOURCE_USERNAME_TO_PRINCIPAL = "relay:social:username-to-principal";
const SOURCE_PRINCIPAL_TO_USERNAME = "relay:social:principal-to-username";

/** Fixed `tenant_key` for username indexes so handles are unique across every relay `tenantKey`. */
export const USERNAME_INDEX_TENANT_KEY = "relay:username-index-global";

/**
 * Upsert profile + principal↔profile registration and username maps in one SQLite transaction.
 * Usernames are **globally** unique in the catalog (not scoped to the relay tenant on `persistence`).
 * `username` is stored via {@link normalizeUsername} (trim, lowercase, GitHub-style handle rules).
 */
export function registerAgentOnColonnadePersistence(
  persistence: AgentRelayPersistence,
  catalogDb: Database,
  store: RelayCatalogSourceMapStore,
  input: SocialRegisterAgentInput,
): SocialAgentIdentity {
  const username = normalizeUsername(input.username);
  const profileId = input.profileUpsert.id;
  const deleteUsernameRow = catalogDb.prepare(
    `DELETE FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
  );

  catalogDb.transaction(() => {
    persistence.profiles.upsert(input.profileUpsert);
    persistence.agentRegistrations.upsert(input.principalId, profileId);

    const usernameHit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_USERNAME_TO_PRINCIPAL,
      username,
    );
    if (usernameHit.found && usernameHit.projection !== null && typeof usernameHit.projection === "object") {
      const existing = (usernameHit.projection as Record<string, unknown>).principalId;
      if (typeof existing === "string" && existing !== input.principalId) {
        throw new Error(`username '${username}' is unavailable`);
      }
    }

    const principalHit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_PRINCIPAL_TO_USERNAME,
      input.principalId,
    );
    if (
      principalHit.found &&
      principalHit.projection !== null &&
      typeof principalHit.projection === "object"
    ) {
      const prevU = (principalHit.projection as Record<string, unknown>).username;
      if (typeof prevU === "string" && prevU !== username) {
        deleteUsernameRow.run(USERNAME_INDEX_TENANT_KEY, SOURCE_USERNAME_TO_PRINCIPAL, prevU);
      }
    }

    store.upsertRow({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      source_map_id: SOURCE_USERNAME_TO_PRINCIPAL,
      entry_key: username,
      pointer: relaySyntheticPointer(USERNAME_INDEX_TENANT_KEY, SOURCE_USERNAME_TO_PRINCIPAL, username),
      projection: { principalId: input.principalId },
    });
    store.upsertRow({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      source_map_id: SOURCE_PRINCIPAL_TO_USERNAME,
      entry_key: input.principalId,
      pointer: relaySyntheticPointer(
        USERNAME_INDEX_TENANT_KEY,
        SOURCE_PRINCIPAL_TO_USERNAME,
        input.principalId,
      ),
      projection: { username },
    });
  })();
  return { principalId: input.principalId, profileId, username };
}
