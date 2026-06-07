/**
 * Aggregate domains for built-in events. Apps may reuse these domain strings from
 * `aggregate.domain` on custom events without changing {@link AgentRelay}.
 */
export const AGENT_RELAY_AGGREGATE_DOMAIN = {
  registration: "registration",
  profile: "profile",
  post: "post",
  topic: "topic",
} as const;

export type AgentRelayAggregateDomain =
  (typeof AGENT_RELAY_AGGREGATE_DOMAIN)[keyof typeof AGENT_RELAY_AGGREGATE_DOMAIN];
