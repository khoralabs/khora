import type { PrincipalId } from "../registration/types.ts";
import type {
  AgentRelayEntityRow,
  AgentRelayEntityUpsert,
  AgentRelayPersistence,
} from "./types.ts";

const TOPIC_SUBJECT_PREFIX = "topic:";

/** Thin facade over {@link AgentRelayPersistence} entity slices (backend-agnostic). */
export type AgentRelayPersistenceClient = {
  readonly persistence: AgentRelayPersistence;
  upsertProfile(record: AgentRelayEntityUpsert): void;
  upsertPost(record: AgentRelayEntityUpsert): void;
  upsertTopic(record: AgentRelayEntityUpsert): void;
  getProfileById(id: string): AgentRelayEntityRow | undefined;
  getPostById(id: string): AgentRelayEntityRow | undefined;
  getTopicById(id: string): AgentRelayEntityRow | undefined;
  upsertAgentRegistration(principalId: PrincipalId, profileId: string): void;
  agentRegistrationExists(principalId: PrincipalId): boolean;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForAgentProfileId(profileId: string): PrincipalId | undefined;
  subscribeAgentSubject(principalId: PrincipalId, subject: string): void;
  unsubscribeAgentSubject(principalId: PrincipalId, subject: string): void;
  listSubjectsForPrincipal(principalId: PrincipalId): string[];
  subscriberPrincipalsForSubject(subject: string, excludePrincipalId?: PrincipalId): PrincipalId[];
  /** Subjects with `topic:` prefix, slug only (for `/v1/topics` and agent sync). */
  listTopicSlugsForPrincipal(principalId: PrincipalId): string[];
  listPostRowsByAuthorProfileIdAndKind(params: {
    authorProfileId: string;
    kind: string;
    limit: number;
  }): AgentRelayEntityRow[];
};

export function createAgentRelayPersistenceClient(
  persistence: AgentRelayPersistence,
): AgentRelayPersistenceClient {
  return {
    persistence,
    upsertProfile: (record) => persistence.profiles.upsert(record),
    upsertPost: (record) => persistence.posts.upsert(record),
    upsertTopic: (record) => persistence.topics.upsert(record),
    getProfileById: (id) => persistence.profiles.getById(id),
    getPostById: (id) => persistence.posts.getById(id),
    getTopicById: (id) => persistence.topics.getById(id),
    upsertAgentRegistration: (principalId, profileId) =>
      persistence.agentRegistrations.upsert(principalId, profileId),
    agentRegistrationExists: (principalId) => persistence.agentRegistrations.exists(principalId),
    profileIdForPrincipal: (principalId) =>
      persistence.agentRegistrations.profileIdForPrincipal(principalId),
    principalForAgentProfileId: (profileId) =>
      persistence.agentRegistrations.principalForProfileId(profileId),
    subscribeAgentSubject: (principalId, subject) =>
      persistence.agentSubjectSubscriptions.subscribe(principalId, subject),
    unsubscribeAgentSubject: (principalId, subject) =>
      persistence.agentSubjectSubscriptions.unsubscribe(principalId, subject),
    listSubjectsForPrincipal: (principalId) =>
      persistence.agentSubjectSubscriptions.listSubjectsForPrincipal(principalId),
    subscriberPrincipalsForSubject: (subject, excludePrincipalId) =>
      persistence.agentSubjectSubscriptions.subscriberPrincipalsForSubject(
        subject,
        excludePrincipalId,
      ),
    listTopicSlugsForPrincipal(principalId) {
      return persistence.agentSubjectSubscriptions
        .listSubjectsForPrincipal(principalId)
        .filter((s) => s.startsWith(TOPIC_SUBJECT_PREFIX))
        .map((s) => s.slice(TOPIC_SUBJECT_PREFIX.length));
    },
    listPostRowsByAuthorProfileIdAndKind: (params) =>
      persistence.posts.listRowsByAuthorProfileIdAndKind(params),
  };
}
