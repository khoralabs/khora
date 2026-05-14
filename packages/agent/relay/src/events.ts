import type { PrincipalRegistrationRequest } from "./registration/types.ts";

/** Stable reference to the logical entity an event refers to. */
export type AgentRelayAggregateRef = {
  domain: string;
  id: string;
};

export type AgentRelayChange = "created" | "updated" | "deleted";

export type AgentRelayEventSource = "swarm" | "app";

/**
 * Standard envelope for swarm and app events so generic handlers can rely on
 * stable fields without per-entity relay methods.
 */
export type AgentRelayEventBase<TKind extends string = string, TPayload = unknown> = {
  kind: TKind;
  occurredAt: number;
  aggregate: AgentRelayAggregateRef;
  change: AgentRelayChange;
  source: AgentRelayEventSource;
  payload: TPayload;
  correlationId?: string;
};

/** Constraint for {@link AgentRelay} `TAppEvent` generic. */
export type AgentRelayAppEventConstraint = AgentRelayEventBase<string, unknown>;

export const AGENT_RELAY_EVENT_KIND = {
  REGISTRATION_PROFILE_BUILD: "swarm.registration.profile_build",
  PROFILE_CREATED: "swarm.profile.created",
  PROFILE_UPDATED: "swarm.profile.updated",
  PROFILE_DELETED: "swarm.profile.deleted",
  POST_CREATED: "swarm.post.created",
  POST_UPDATED: "swarm.post.updated",
  POST_DELETED: "swarm.post.deleted",
  TOPIC_CREATED: "swarm.topic.created",
  TOPIC_UPDATED: "swarm.topic.updated",
  TOPIC_DELETED: "swarm.topic.deleted",
} as const;

/** Emitted during {@link AgentRelay.registerPrincipal}; listener must call `fulfill` or `reject` exactly once. */
export type AgentRelayRegistrationProfileBuildPayload<TProfile> = {
  request: PrincipalRegistrationRequest;
  fulfill: (profile: TProfile) => void;
  reject: (reason: unknown) => void;
};

export type AgentRelayRegistrationProfileBuildEvent<TProfile> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
  AgentRelayRegistrationProfileBuildPayload<TProfile>
>;

export type AgentRelayProfileCreatedEvent<TProfile> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.PROFILE_CREATED,
  { profile: TProfile }
>;

export type AgentRelayProfileUpdatedEvent<TProfile> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.PROFILE_UPDATED,
  { profile: TProfile; previous: TProfile }
>;

export type AgentRelayProfileDeletedEvent<TProfile> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.PROFILE_DELETED,
  { profile: TProfile }
>;

export type AgentRelayPostCreatedEvent<TPost> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.POST_CREATED,
  { post: TPost }
>;

export type AgentRelayPostUpdatedEvent<TPost> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.POST_UPDATED,
  { post: TPost; previous: TPost }
>;

export type AgentRelayPostDeletedEvent<TPost> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.POST_DELETED,
  { post: TPost }
>;

export type AgentRelayTopicCreatedEvent<TTopic> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.TOPIC_CREATED,
  { topic: TTopic }
>;

export type AgentRelayTopicUpdatedEvent<TTopic> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.TOPIC_UPDATED,
  { topic: TTopic; previous: TTopic }
>;

export type AgentRelayTopicDeletedEvent<TTopic> = AgentRelayEventBase<
  typeof AGENT_RELAY_EVENT_KIND.TOPIC_DELETED,
  { topic: TTopic }
>;

export type AgentRelayBuiltInEvent<TProfile = unknown, TPost = unknown, TTopic = unknown> =
  | AgentRelayRegistrationProfileBuildEvent<TProfile>
  | AgentRelayProfileCreatedEvent<TProfile>
  | AgentRelayProfileUpdatedEvent<TProfile>
  | AgentRelayProfileDeletedEvent<TProfile>
  | AgentRelayPostCreatedEvent<TPost>
  | AgentRelayPostUpdatedEvent<TPost>
  | AgentRelayPostDeletedEvent<TPost>
  | AgentRelayTopicCreatedEvent<TTopic>
  | AgentRelayTopicUpdatedEvent<TTopic>
  | AgentRelayTopicDeletedEvent<TTopic>;

export type AgentRelayEventUnion<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends AgentRelayAppEventConstraint = never,
> =
  | AgentRelayBuiltInEvent<TProfile, TPost, TTopic>
  | ([TAppEvent] extends [never] ? never : TAppEvent);
