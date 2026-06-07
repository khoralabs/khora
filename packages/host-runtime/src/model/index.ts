/**
 * Aggregate domains for built-in events. Apps may reuse these domain strings from
 * `aggregate.domain` on custom events without changing {@link HostRuntime}.
 */
export const HOST_AGGREGATE_DOMAIN = {
  registration: "registration",
  profile: "profile",
} as const;

export type HostAggregateDomain =
  (typeof HOST_AGGREGATE_DOMAIN)[keyof typeof HOST_AGGREGATE_DOMAIN];
