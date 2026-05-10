/**
 * Logical aggregate domains for built-in swarm entities. Extend with app-specific
 * `aggregate.domain` strings on custom events without changing {@link SwarmHost}.
 */
export const SWARM_AGGREGATE_DOMAIN = {
  profile: "profile",
  post: "post",
  topic: "topic",
  registration: "registration",
} as const;

export type SwarmAggregateDomain =
  (typeof SWARM_AGGREGATE_DOMAIN)[keyof typeof SWARM_AGGREGATE_DOMAIN];

/**
 * Link from a host logical entity to Memories rows. Semantic merges use user source keys such as:
 * - `profile:${profileId}`
 * - `post:${postId}`
 * - `topic:${topicId}`
 *
 * Bookkeeping record shapes (`TProfile`, `TPost`, `TTopic`) live in the app; resolve them via
 * `SwarmHostStores` from search hits or source maps.
 */
export type SourceMapLink = {
  memoryNamespace: string;
  memoryId?: string;
};
