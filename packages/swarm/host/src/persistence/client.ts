import type { AgentDid } from "../registration/types.ts";
import type { SwarmHostEntityRow, SwarmHostEntityUpsert, SwarmHostPersistence } from "./types.ts";

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
  subscribeAgentTopic(did: AgentDid, topicSlug: string): void;
  unsubscribeAgentTopic(did: AgentDid, topicSlug: string): void;
  listTopicSlugsForAgentDid(did: AgentDid): string[];
  subscriberDidsForTopicSlug(topicSlug: string, excludeDid?: AgentDid): AgentDid[];
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
    subscribeAgentTopic: (did, topicSlug) =>
      persistence.agentTopicSubscriptions.subscribe(did, topicSlug),
    unsubscribeAgentTopic: (did, topicSlug) =>
      persistence.agentTopicSubscriptions.unsubscribe(did, topicSlug),
    listTopicSlugsForAgentDid: (did) => persistence.agentTopicSubscriptions.listSlugsForDid(did),
    subscriberDidsForTopicSlug: (topicSlug, excludeDid) =>
      persistence.agentTopicSubscriptions.subscriberDidsForTopic(topicSlug, excludeDid),
    listPostRowsByAuthorProfileIdAndKind: (params) =>
      persistence.posts.listRowsByAuthorProfileIdAndKind(params),
  };
}
