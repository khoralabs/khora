import type {
  DefaultEntityMap,
  LabelSchemaMap,
  MemoriesClient,
  SearchHit,
} from "@khoralabs/memories-core";
import {
  type EmbeddingModel,
  type HybridMemorySearchClient,
  type HybridMemorySearchInput,
  type MemorySearchHit,
  runHybridMemorySearch,
} from "@khoralabs/memories-core/helpers";
import {
  createSwarmMemoriesSyncHandler,
  SWARM_EVENT_KIND,
  type SwarmAppEventConstraint,
  type SwarmHostEventUnion,
  type SwarmMemoryOpMapper,
} from "./events.ts";
import type { InboxFanoutPort } from "./inbox/inbox-fanout-port.ts";
import {
  resolveSwarmHostSearchNamespaces,
  type SwarmHostMemoryNamespaces,
  type SwarmHostSearchScope,
} from "./memory-search-scope.ts";
import { SWARM_AGGREGATE_DOMAIN } from "./model/index.ts";
import type { NegotiationRoomHubPort } from "./negotiation-room/port.ts";
import {
  createSwarmHostPersistenceClient,
  type SwarmHostPersistenceClient,
} from "./persistence/client.ts";
import type { SwarmHostPersistence } from "./persistence/types.ts";
import type { AgentNotificationBufferPort } from "./registration/notifications.ts";
import {
  type AgentDid,
  type DidRegistrationRequest,
  type DidRegistrationResult,
  isLikelyDidString,
  profileEntityId,
} from "./registration/types.ts";
import type { DidVerifier, RegistrationVerifyContext } from "./registration/verify.ts";
import { type SwarmHostStores, searchHitToSourceMapRef } from "./stores.ts";

export type {
  SwarmHostMemoryEntityKind,
  SwarmHostMemoryNamespaces,
  SwarmHostSearchScope,
} from "./memory-search-scope.ts";
export { resolveSwarmHostSearchNamespaces } from "./memory-search-scope.ts";

/** Scoped hybrid search arguments for {@link SwarmHost.search}. */
export type SwarmHostSearchArgs = HybridMemorySearchInput & {
  scope: SwarmHostSearchScope;
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  embeddingModel?: EmbeddingModel;
};

/** Alias for {@link SwarmHostSearchArgs} (Memories search via {@link SwarmHost.search}). */
export type MemoriesSearchArgs = SwarmHostSearchArgs;

/** Alias for {@link SwarmHostSearchScope}. */
export type MemoriesSearchScope = SwarmHostSearchScope;

/** Arguments for {@link SwarmHost.searchMemories} (hybrid lexical + vector search). */
export type SwarmHostSearchMemoriesArgs = HybridMemorySearchInput & {
  namespace: string;
  additionalNamespaces?: readonly string[];
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  /** Per-call override of {@link SwarmHostDeps.embeddingModel}. */
  embeddingModel?: EmbeddingModel;
};

/** Passed to {@link SwarmHostDeps.onEvent} together with each dispatched event. */
export type SwarmHostEventHandlerCtx<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
> = {
  memories: MemoriesClient<TNode, TEdge, TEntityMap>;
  persistence: SwarmHostPersistence;
  persistenceClient: SwarmHostPersistenceClient;
  /** Same optional model as {@link SwarmHostDeps.embeddingModel} (AI SDK–backed). */
  embeddingModel?: EmbeddingModel;
  notificationBuffer?: AgentNotificationBufferPort;
  /** When set, agent inbox WebSocket fan-out (see {@link deliverAgentNotification} from inbox module). */
  inboxHub?: InboxFanoutPort;
  /** App-owned runtime handle(s); swarm-host does not interpret (e.g. SQLite `Database`). */
  appContext?: unknown;
  search: (args: SwarmHostSearchArgs) => Promise<MemorySearchHit[]>;
  searchMemories: (args: SwarmHostSearchMemoriesArgs) => Promise<MemorySearchHit[]>;
};

export type SwarmHostDeps<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
> = {
  memories: MemoriesClient<TNode, TEdge, TEntityMap>;
  persistence: SwarmHostPersistence;
  stores?: SwarmHostStores<TProfile, TPost, TTopic>;
  /** Optional negotiation opaque byte relay (HMAC tickets, replay on re-join). */
  negotiationRoomHub?: NegotiationRoomHubPort;
  didVerifier: DidVerifier;
  notificationBuffer?: AgentNotificationBufferPort;
  inboxHub?: InboxFanoutPort;
  /** Opaque app runtime (passed through to {@link SwarmHostEventHandlerCtx.appContext}). */
  appContext?: unknown;
  /**
   * Maps entity scopes ({@link SwarmHost.search}) to Memories namespace paths. Required for non-`raw` scopes.
   */
  memoryNamespaces?: SwarmHostMemoryNamespaces;
  /**
   * Optional embedding model for {@link SwarmHost.search} / {@link SwarmHost.searchMemories} when the vector arm is used.
   * Construct with {@link createMemoriesEmbeddingModel} from `@khoralabs/memories-core/helpers`.
   */
  embeddingModel?: EmbeddingModel;
  onEvent?: (
    ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>,
    event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>;
};

/**
 * Runs Memories merge/delete projection before each non-registration event, then `handler`.
 * Compose with {@link SwarmHostDeps.onEvent} when mapping swarm events to Memories outside the host.
 */
export function composeOnEventWithMemorySync<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
>(
  memories: MemoriesClient<TNode, TEdge, TEntityMap>,
  mapMemoryOps: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>,
  handler: (
    ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>,
    event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>,
): (
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>,
  event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
) => void | Promise<void> {
  const sync = createSwarmMemoriesSyncHandler(memories, mapMemoryOps);
  return async (ctx, event) => {
    if (event.kind !== SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      await sync(event);
    }
    return handler(ctx, event);
  };
}

/**
 * Facade for discovery (Memories), optional persistence resolvers, negotiation ports, and DID registration.
 * Domain CRUD will call {@link SwarmHost.notify} in a later iteration.
 */
export class SwarmHost<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
> {
  readonly memories: MemoriesClient<TNode, TEdge, TEntityMap>;
  readonly persistence: SwarmHostPersistence;
  readonly persistenceClient: SwarmHostPersistenceClient;
  readonly stores?: SwarmHostStores<TProfile, TPost, TTopic>;
  readonly negotiationRoomHub?: NegotiationRoomHubPort;
  readonly didVerifier: DidVerifier;
  readonly notificationBuffer?: AgentNotificationBufferPort;
  readonly inboxHub?: InboxFanoutPort;
  readonly appContext?: unknown;
  readonly embeddingModel?: EmbeddingModel;
  readonly memoryNamespaces?: SwarmHostMemoryNamespaces;

  private readonly onEvent?: SwarmHostDeps<
    TNode,
    TEdge,
    TProfile,
    TPost,
    TTopic,
    TAppEvent,
    TEntityMap
  >["onEvent"];

  constructor(deps: SwarmHostDeps<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent, TEntityMap>) {
    if (deps.didVerifier === undefined) {
      throw new Error("SwarmHost: didVerifier is required");
    }
    this.memories = deps.memories;
    this.persistence = deps.persistence;
    this.persistenceClient = createSwarmHostPersistenceClient(deps.persistence);
    this.stores = deps.stores;
    this.negotiationRoomHub = deps.negotiationRoomHub;
    this.didVerifier = deps.didVerifier;
    this.notificationBuffer = deps.notificationBuffer;
    this.inboxHub = deps.inboxHub;
    this.appContext = deps.appContext;
    this.embeddingModel = deps.embeddingModel;
    this.memoryNamespaces = deps.memoryNamespaces;
    this.onEvent = deps.onEvent;
  }

  private eventCtx(): SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap> {
    return {
      memories: this.memories,
      persistence: this.persistence,
      persistenceClient: this.persistenceClient,
      embeddingModel: this.embeddingModel,
      notificationBuffer: this.notificationBuffer,
      inboxHub: this.inboxHub,
      appContext: this.appContext,
      search: (args) => this.search(args),
      searchMemories: (args) => this.searchMemories(args),
    };
  }

  /**
   * Hybrid memory search with explicit namespace paths (escape hatch besides {@link SwarmHost.search} scopes).
   */
  searchMemories(args: SwarmHostSearchMemoriesArgs): Promise<MemorySearchHit[]> {
    const {
      namespace,
      additionalNamespaces,
      embeddingCache,
      memoriesSnapshotRootHex,
      embeddingModel: modelArg,
      content,
      options,
      searchScopeMode,
    } = args;
    const embeddingModel = modelArg ?? this.embeddingModel;
    return runHybridMemorySearch(
      this.memories as unknown as HybridMemorySearchClient,
      {
        namespace,
        additionalNamespaces,
        embeddingModel,
        embeddingCache,
        memoriesSnapshotRootHex,
      },
      { content, options, ...(searchScopeMode !== undefined ? { searchScopeMode } : {}) },
    );
  }

  /**
   * Hybrid Memories search with a discriminated {@link SwarmHostSearchScope} (profiles, posts, topics, multi, or raw paths).
   */
  search(args: SwarmHostSearchArgs): Promise<MemorySearchHit[]> {
    const {
      scope,
      embeddingCache,
      memoriesSnapshotRootHex,
      embeddingModel: modelArg,
      content,
      options,
      searchScopeMode,
    } = args;
    const embeddingModel = modelArg ?? this.embeddingModel;
    const { namespace, additionalNamespaces } = resolveSwarmHostSearchNamespaces(
      scope,
      this.memoryNamespaces,
    );
    return runHybridMemorySearch(
      this.memories as unknown as HybridMemorySearchClient,
      {
        namespace,
        additionalNamespaces,
        embeddingModel,
        embeddingCache,
        memoriesSnapshotRootHex,
      },
      { content, options, ...(searchScopeMode !== undefined ? { searchScopeMode } : {}) },
    );
  }

  /**
   * Dispatches to {@link SwarmHostDeps.onEvent}. Use {@link composeOnEventWithMemorySync} to prepend Memories sync.
   */
  notify(event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>): void | Promise<void> {
    const ctx = this.eventCtx();
    const handler = this.onEvent;
    if (handler === undefined) {
      return;
    }
    return handler(ctx, event);
  }

  /**
   * Verify DID via {@link SwarmHostDeps.didVerifier}, emit
   * `swarm.registration.profile_build` so {@link SwarmHostDeps.onEvent} can call `payload.fulfill(profile)`,
   * then emit `swarm.profile.created` and register the DID with the notification buffer.
   */
  async registerWithDid(
    req: DidRegistrationRequest,
    registrationExtra: Omit<RegistrationVerifyContext, "request">,
  ): Promise<DidRegistrationResult<TProfile>> {
    if (!isLikelyDidString(req.did)) {
      throw new Error("SwarmHost: registration `did` must match did:<method>:…");
    }
    await this.didVerifier.verifyRegistration({ request: req, ...registrationExtra });
    const onEvent = this.onEvent;
    if (onEvent === undefined) {
      throw new Error(
        "SwarmHost: onEvent is required for registerWithDid (handle swarm.registration.profile_build)",
      );
    }

    const profile = await new Promise<TProfile>((resolve, reject) => {
      let settled = false;
      const fulfill = (p: TProfile) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(p);
      };
      const rej = (reason: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(reason);
      };

      const buildEvent: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent> = {
        kind: SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
        occurredAt: Date.now(),
        aggregate: { domain: SWARM_AGGREGATE_DOMAIN.registration, id: req.did },
        change: "created",
        source: "swarm",
        payload: { request: req, fulfill, reject: rej },
        correlationId: req.correlationId,
      };

      void Promise.resolve(onEvent(this.eventCtx(), buildEvent)).then(() => {
        if (!settled) {
          rej(
            new Error(
              "SwarmHost: onEvent must call fulfill(profile) or reject(reason) for swarm.registration.profile_build",
            ),
          );
        }
      }, rej);
    });

    const profileId = profileEntityId(profile);
    const createdEvent: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent> = {
      kind: SWARM_EVENT_KIND.PROFILE_CREATED,
      occurredAt: Date.now(),
      aggregate: { domain: SWARM_AGGREGATE_DOMAIN.profile, id: profileId },
      change: "created",
      source: "swarm",
      payload: { profile },
      correlationId: req.correlationId,
    };
    await Promise.resolve(this.notify(createdEvent));
    await this.notificationBuffer?.ensureRegistered(req.did);
    return { did: req.did, profile, profileId };
  }

  /**
   * Queue a join ticket for another agent (e.g. after {@link NegotiationRoomHubPort.createRoom}).
   * Requires {@link SwarmHostDeps.notificationBuffer}.
   */
  async offerNegotiationRoomToDid(params: {
    targetDid: AgentDid;
    roomId: string;
    ticket: string;
    expiresAtMs?: number;
    fromDid?: AgentDid;
  }): Promise<void> {
    const buf = this.notificationBuffer;
    if (buf === undefined) {
      throw new Error("SwarmHost: notificationBuffer is required for offerNegotiationRoomToDid");
    }
    await buf.enqueue(params.targetDid, {
      kind: "negotiation_ticket",
      payload: {
        roomId: params.roomId,
        ticket: params.ticket,
        expiresAtMs: params.expiresAtMs,
        issuedAtMs: Date.now(),
        fromDid: params.fromDid,
      },
    });
  }

  resolveProfileFromHit(hit: SearchHit): Promise<TProfile | undefined> {
    return (
      this.stores?.profile?.resolve(searchHitToSourceMapRef(hit)) ?? Promise.resolve(undefined)
    );
  }

  resolvePostFromHit(hit: SearchHit): Promise<TPost | undefined> {
    return this.stores?.post?.resolve(searchHitToSourceMapRef(hit)) ?? Promise.resolve(undefined);
  }

  resolveTopicFromHit(hit: SearchHit): Promise<TTopic | undefined> {
    return this.stores?.topic?.resolve(searchHitToSourceMapRef(hit)) ?? Promise.resolve(undefined);
  }
}
