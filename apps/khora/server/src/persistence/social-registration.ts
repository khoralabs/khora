import type { Database } from "bun:sqlite";
import { normalizeUsername } from "@khoralabs/khora-contracts";
import type {
  KhoraHostPersistence,
  SocialAgentIdentity,
  SocialRegisterAgentInput,
} from "@khoralabs/khora-host";

export function registerAgentOnPersistence(
  persistence: KhoraHostPersistence,
  catalogDb: Database,
  input: SocialRegisterAgentInput,
): SocialAgentIdentity {
  const username = normalizeUsername(input.username);
  const profileId = input.profileUpsert.id;

  catalogDb.transaction(() => {
    persistence.profiles.upsert(input.profileUpsert);
    persistence.registrations.upsert(input.principalId, profileId);

    const existingPrincipal = persistence.usernameIndex.lookupByUsername(username);
    if (existingPrincipal !== undefined && existingPrincipal !== input.principalId) {
      throw new Error(`username '${username}' is unavailable`);
    }

    persistence.usernameIndex.setForPrincipal(input.principalId, username);
  })();

  return { principalId: input.principalId, profileId, username };
}
