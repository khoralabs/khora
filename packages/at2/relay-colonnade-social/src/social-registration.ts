import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { SocialAgentIdentity, SocialRegisterAgentInput } from "./social-types.ts";

/**
 * Upsert profile + principal↔profile registration in one SQLite transaction.
 * Use with relay-colonnade-backed persistence only (shared `catalogDb`).
 */
export function registerAgentOnColonnadePersistence(
  persistence: AgentRelayPersistence,
  catalogDb: Database,
  input: SocialRegisterAgentInput,
): SocialAgentIdentity {
  const profileId = input.profileUpsert.id;
  catalogDb.transaction(() => {
    persistence.profiles.upsert(input.profileUpsert);
    persistence.agentRegistrations.upsert(input.principalId, profileId);
  })();
  return { principalId: input.principalId, profileId };
}
