import type { LabelSchemaMap, MemoriesClient, SearchHit } from "@cfd/memories-core";
import {
  createSwarmMemoriesSyncHandler,
  SWARM_EVENT_KIND,
  type SwarmAppEventConstraint,
  type SwarmHostEventUnion,
  type SwarmMemoriesSyncHandler,
  type SwarmMemoryOpMapper,
} from "./events.ts";
import { SWARM_AGGREGATE_DOMAIN } from "./model/index.ts";
import type { ObpRoomHubPort } from "./obp-room/port.ts";
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
import type { DidRegistrationVerifier } from "./registration/verify.ts";
import { type SwarmHostStores, searchHitToSourceMapRef } from "./stores.ts";

/** Passed to {@link SwarmHostDeps.onEvent} together with each dispatched event. */
export type SwarmHostEventHandlerCtx<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap> = {
  memories: MemoriesClient<TNode, TEdge>;
  persistence: SwarmHostPersistence;
  persistenceClient: SwarmHostPersistenceClient;
};

export type SwarmHostDeps<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = {
  memories: MemoriesClient<TNode, TEdge>;
  persistence: SwarmHostPersistence;
  /** When set, runs before {@link SwarmHostDeps.onEvent} for all events except registration profile build. */
  mapEvent?: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>;
  stores?: SwarmHostStores<TProfile, TPost, TTopic>;
  /** Optional OBP opaque byte relay (HMAC tickets, replay on re-join). */
  obpRoomHub?: ObpRoomHubPort;
  didVerifier?: DidRegistrationVerifier;
  notificationBuffer?: AgentNotificationBufferPort;
  onEvent?: (
    ctx: SwarmHostEventHandlerCtx<TNode, TEdge>,
    event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>;
};

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
> {
  readonly memories: MemoriesClient<TNode, TEdge>;
  readonly persistence: SwarmHostPersistence;
  readonly persistenceClient: SwarmHostPersistenceClient;
  readonly stores?: SwarmHostStores<TProfile, TPost, TTopic>;
  readonly obpRoomHub?: ObpRoomHubPort;
  readonly didVerifier?: DidRegistrationVerifier;
  readonly notificationBuffer?: AgentNotificationBufferPort;

  private readonly memoriesSync?: SwarmMemoriesSyncHandler<TProfile, TPost, TTopic, TAppEvent>;
  private readonly onEvent?: SwarmHostDeps<
    TNode,
    TEdge,
    TProfile,
    TPost,
    TTopic,
    TAppEvent
  >["onEvent"];

  constructor(deps: SwarmHostDeps<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>) {
    this.memories = deps.memories;
    this.persistence = deps.persistence;
    this.persistenceClient = createSwarmHostPersistenceClient(deps.persistence);
    this.stores = deps.stores;
    this.obpRoomHub = deps.obpRoomHub;
    this.didVerifier = deps.didVerifier;
    this.notificationBuffer = deps.notificationBuffer;
    this.onEvent = deps.onEvent;
    if (deps.mapEvent !== undefined) {
      this.memoriesSync = createSwarmMemoriesSyncHandler(
        deps.memories as unknown as MemoriesClient<TNode, TEdge>,
        deps.mapEvent,
      );
    }
  }

  private eventCtx(): SwarmHostEventHandlerCtx<TNode, TEdge> {
    return {
      memories: this.memories,
      persistence: this.persistence,
      persistenceClient: this.persistenceClient,
    };
  }

  /**
   * Registration build: only {@link SwarmHostDeps.onEvent}. Other events: optional `mapEvent` sync, then `onEvent`.
   */
  notify(event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>): void | Promise<void> {
    const ctx = this.eventCtx();
    const handler = this.onEvent;
    if (handler === undefined) {
      return;
    }
    if (event.kind === SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      return handler(ctx, event);
    }
    const sync = this.memoriesSync?.(event);
    return Promise.resolve(sync).then(() => handler(ctx, event));
  }

  /**
   * Verify DID (unless {@link DidRegistrationRequest.skipVerification}), emit
   * `swarm.registration.profile_build` so {@link SwarmHostDeps.onEvent} can call `payload.fulfill(profile)`,
   * then emit `swarm.profile.created` and register the DID with the notification buffer.
   */
  async registerWithDid(req: DidRegistrationRequest): Promise<DidRegistrationResult<TProfile>> {
    if (!isLikelyDidString(req.did)) {
      throw new Error("SwarmHost: registration `did` must match did:<method>:…");
    }
    if (req.skipVerification !== true) {
      if (this.didVerifier === undefined) {
        throw new Error(
          "SwarmHost: configure didVerifier or set skipVerification true (dev only) on the request",
        );
      }
      await this.didVerifier.verify(req);
    }
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
   * Queue a join ticket for another agent (e.g. after {@link ObpRoomHubPort.createRoom}).
   * Requires {@link SwarmHostDeps.notificationBuffer}.
   */
  async offerObpRoomToDid(params: {
    targetDid: AgentDid;
    roomId: string;
    ticket: string;
    expiresAtMs?: number;
    fromDid?: AgentDid;
  }): Promise<void> {
    const buf = this.notificationBuffer;
    if (buf === undefined) {
      throw new Error("SwarmHost: notificationBuffer is required for offerObpRoomToDid");
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
