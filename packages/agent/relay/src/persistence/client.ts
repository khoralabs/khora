import type { PrincipalId } from "../registration/types.ts";
import type {
  AgentRelayEntityRow,
  AgentRelayEntityUpsert,
  AgentRelayPersistence,
} from "./types.ts";

/** Thin facade over {@link AgentRelayPersistence} entity slices (backend-agnostic). */
export type AgentRelayPersistenceClient = {
  readonly persistence: AgentRelayPersistence;
  upsertProfile(record: AgentRelayEntityUpsert): void;
  upsertTopic(record: AgentRelayEntityUpsert): void;
  getProfileById(id: string): AgentRelayEntityRow | undefined;
  getTopicById(id: string): AgentRelayEntityRow | undefined;
  upsertAgentRegistration(principalId: PrincipalId, profileId: string): void;
  agentRegistrationExists(principalId: PrincipalId): boolean;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForAgentProfileId(profileId: string): PrincipalId | undefined;
};

export function createAgentRelayPersistenceClient(
  persistence: AgentRelayPersistence,
): AgentRelayPersistenceClient {
  return {
    persistence,
    upsertProfile: (record) => persistence.profiles.upsert(record),
    upsertTopic: (record) => persistence.topics.upsert(record),
    getProfileById: (id) => persistence.profiles.getById(id),
    getTopicById: (id) => persistence.topics.getById(id),
    upsertAgentRegistration: (principalId, profileId) =>
      persistence.agentRegistrations.upsert(principalId, profileId),
    agentRegistrationExists: (principalId) => persistence.agentRegistrations.exists(principalId),
    profileIdForPrincipal: (principalId) =>
      persistence.agentRegistrations.profileIdForPrincipal(principalId),
    principalForAgentProfileId: (profileId) =>
      persistence.agentRegistrations.principalForProfileId(profileId),
  };
}
