import type { SwarmHostEntityUpsert, SwarmHostPersistence } from "./types.ts";

/** Thin facade over {@link SwarmHostPersistence} entity slices (backend-agnostic). */
export type SwarmHostPersistenceClient = {
  readonly persistence: SwarmHostPersistence;
  upsertProfile(record: SwarmHostEntityUpsert): void;
  upsertPost(record: SwarmHostEntityUpsert): void;
  upsertTopic(record: SwarmHostEntityUpsert): void;
};

export function createSwarmHostPersistenceClient(
  persistence: SwarmHostPersistence,
): SwarmHostPersistenceClient {
  return {
    persistence,
    upsertProfile: (record) => persistence.profiles.upsert(record),
    upsertPost: (record) => persistence.posts.upsert(record),
    upsertTopic: (record) => persistence.topics.upsert(record),
  };
}
