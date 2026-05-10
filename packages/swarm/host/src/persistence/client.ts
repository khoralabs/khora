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
  };
}
