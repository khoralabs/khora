import type { AgentDid } from "../registration/types.ts";
import type { SwarmHostEntityRow, SwarmHostEntityUpsert, SwarmHostPersistence } from "./types.ts";

const TOPIC_SUBJECT_PREFIX = "topic:";

/** Thin facade over {@link SwarmHostPersistence} entity slices (backend-agnostic). */
export type SwarmHostPersistenceClient = {
  readonly persistence: SwarmHostPersistence;
  upsertProfile(record: SwarmHostEntityUpsert): void;
  upsertPost(record: SwarmHostEntityUpsert): void;
  upsertTopic(record: SwarmHostEntityUpsert): void;
  getProfileById(id: string): SwarmHostEntityRow | undefined;
  getPostById(id: string): SwarmHostEntityRow | undefined;
  getTopicById(id: string): SwarmHostEntityRow | undefined;
  upsertAgentRegistration(did: AgentDid, profileId: string): void;
  agentRegistrationExists(did: AgentDid): boolean;
  profileIdForAgentDid(did: AgentDid): string | undefined;
  didForAgentProfileId(profileId: string): AgentDid | undefined;
  subscribeAgentSubject(did: AgentDid, subject: string): void;
  unsubscribeAgentSubject(did: AgentDid, subject: string): void;
  listSubjectsForAgentDid(did: AgentDid): string[];
  subscriberDidsForSubject(subject: string, excludeDid?: AgentDid): AgentDid[];
  /** Subjects with `topic:` prefix, slug only (for `/v1/topics` and agent sync). */
  listTopicSlugsForAgentDid(did: AgentDid): string[];
  listPostRowsByAuthorProfileIdAndKind(params: {
    authorProfileId: string;
    kind: string;
    limit: number;
  }): SwarmHostEntityRow[];
};

export function createSwarmHostPersistenceClient(
  persistence: SwarmHostPersistence,
): SwarmHostPersistenceClient {
  return {
    persistence,
    upsertProfile: (record) => persistence.profiles.upsert(record),
    upsertPost: (record) => persistence.posts.upsert(record),
    upsertTopic: (record) => persistence.topics.upsert(record),
    getProfileById: (id) => persistence.profiles.getById(id),
    getPostById: (id) => persistence.posts.getById(id),
    getTopicById: (id) => persistence.topics.getById(id),
    upsertAgentRegistration: (did, profileId) =>
      persistence.agentRegistrations.upsert(did, profileId),
    agentRegistrationExists: (did) => persistence.agentRegistrations.exists(did),
    profileIdForAgentDid: (did) => persistence.agentRegistrations.profileIdForDid(did),
    didForAgentProfileId: (profileId) => persistence.agentRegistrations.didForProfileId(profileId),
    subscribeAgentSubject: (did, subject) =>
      persistence.agentSubjectSubscriptions.subscribe(did, subject),
    unsubscribeAgentSubject: (did, subject) =>
      persistence.agentSubjectSubscriptions.unsubscribe(did, subject),
    listSubjectsForAgentDid: (did) => persistence.agentSubjectSubscriptions.listSubjectsForDid(did),
    subscriberDidsForSubject: (subject, excludeDid) =>
      persistence.agentSubjectSubscriptions.subscriberDidsForSubject(subject, excludeDid),
    listTopicSlugsForAgentDid(did) {
      return persistence.agentSubjectSubscriptions
        .listSubjectsForDid(did)
        .filter((s) => s.startsWith(TOPIC_SUBJECT_PREFIX))
        .map((s) => s.slice(TOPIC_SUBJECT_PREFIX.length));
    },
    listPostRowsByAuthorProfileIdAndKind: (params) =>
      persistence.posts.listRowsByAuthorProfileIdAndKind(params),
  };
}
