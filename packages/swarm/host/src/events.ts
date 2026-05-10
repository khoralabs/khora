import type {
  DeleteMemoryParams,
  LabelSchemaMap,
  MemoriesClient,
  MergeMemoryParams,
} from "@cfd/memories-core";
import type { DidRegistrationRequest } from "./registration/types.ts";

/** Stable reference to the logical entity an event refers to. */
export type SwarmAggregateRef = {
  domain: string;
  id: string;
};

export type SwarmHostChange = "created" | "updated" | "deleted";

export type SwarmHostEventSource = "swarm" | "app";

/**
 * Standard envelope for swarm and app events so generic handlers (e.g. Memories sync) can rely on
 * stable fields without per-entity host methods.
 */
export type SwarmHostEventBase<TKind extends string = string, TPayload = unknown> = {
  kind: TKind;
  occurredAt: number;
  aggregate: SwarmAggregateRef;
  change: SwarmHostChange;
  source: SwarmHostEventSource;
  payload: TPayload;
  correlationId?: string;
};

/** Constraint for {@link SwarmHost} `TAppEvent` generic. */
export type SwarmAppEventConstraint = SwarmHostEventBase<string, unknown>;

export const SWARM_EVENT_KIND = {
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

/** Emitted during {@link SwarmHost.registerWithDid}; listener must call `fulfill` or `reject` exactly once. */
export type SwarmRegistrationProfileBuildPayload<TProfile> = {
  request: DidRegistrationRequest;
  fulfill: (profile: TProfile) => void;
  reject: (reason: unknown) => void;
};

export type SwarmRegistrationProfileBuildEvent<TProfile> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
  SwarmRegistrationProfileBuildPayload<TProfile>
>;

export type SwarmProfileCreatedEvent<TProfile> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.PROFILE_CREATED,
  { profile: TProfile }
>;

export type SwarmProfileUpdatedEvent<TProfile> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.PROFILE_UPDATED,
  { profile: TProfile; previous: TProfile }
>;

export type SwarmProfileDeletedEvent<TProfile> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.PROFILE_DELETED,
  { profile: TProfile }
>;

export type SwarmPostCreatedEvent<TPost> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.POST_CREATED,
  { post: TPost }
>;

export type SwarmPostUpdatedEvent<TPost> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.POST_UPDATED,
  { post: TPost; previous: TPost }
>;

export type SwarmPostDeletedEvent<TPost> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.POST_DELETED,
  { post: TPost }
>;

export type SwarmTopicCreatedEvent<TTopic> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.TOPIC_CREATED,
  { topic: TTopic }
>;

export type SwarmTopicUpdatedEvent<TTopic> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.TOPIC_UPDATED,
  { topic: TTopic; previous: TTopic }
>;

export type SwarmTopicDeletedEvent<TTopic> = SwarmHostEventBase<
  typeof SWARM_EVENT_KIND.TOPIC_DELETED,
  { topic: TTopic }
>;

export type SwarmBuiltInEvent<TProfile = unknown, TPost = unknown, TTopic = unknown> =
  | SwarmRegistrationProfileBuildEvent<TProfile>
  | SwarmProfileCreatedEvent<TProfile>
  | SwarmProfileUpdatedEvent<TProfile>
  | SwarmProfileDeletedEvent<TProfile>
  | SwarmPostCreatedEvent<TPost>
  | SwarmPostUpdatedEvent<TPost>
  | SwarmPostDeletedEvent<TPost>
  | SwarmTopicCreatedEvent<TTopic>
  | SwarmTopicUpdatedEvent<TTopic>
  | SwarmTopicDeletedEvent<TTopic>;

export type SwarmHostEventUnion<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = SwarmBuiltInEvent<TProfile, TPost, TTopic> | ([TAppEvent] extends [never] ? never : TAppEvent);

/** Single merge or delete applied by a Memories sync loop. */
export type SwarmMemoryOp<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
> =
  | { op: "merge"; params: MergeMemoryParams<TNode, TEdge> }
  | { op: "delete"; params: DeleteMemoryParams };

/** Pure projection from a host event to memory operations (empty = no effect). */
export type SwarmMemoryOpMapper<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = (
  event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
) => SwarmMemoryOp<TNode, TEdge>[] | Promise<SwarmMemoryOp<TNode, TEdge>[]>;

export type SwarmMemoriesSyncHandler<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = (event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>) => void | Promise<void>;

/**
 * Compose a {@link SwarmMemoriesSyncHandler} from a mapper; builders typically supply only `mapEvent`.
 */
export function createSwarmMemoriesSyncHandler<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
>(
  client: MemoriesClient<TNode, TEdge>,
  mapEvent: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>,
): SwarmMemoriesSyncHandler<TProfile, TPost, TTopic, TAppEvent> {
  return async (event) => {
    const ops = await Promise.resolve(mapEvent(event));
    for (const step of ops) {
      if (step.op === "merge") {
        client.mergeMemory(step.params);
      } else {
        client.deleteMemory(step.params);
      }
    }
  };
}
