import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayAppEventConstraint,
  type AgentRelayEventUnion,
} from "./events.ts";
import type { FrameChannelHubPort } from "./frame-channel/port.ts";
import type { InboxFanoutPort } from "./inbox/inbox-fanout-port.ts";
import { AGENT_RELAY_AGGREGATE_DOMAIN } from "./model/index.ts";
import {
  type AgentRelayPersistenceClient,
  createAgentRelayPersistenceClient,
} from "./persistence/client.ts";
import type { AgentRelayPersistence } from "./persistence/types.ts";
import type { AgentNotificationBufferPort } from "./registration/notifications.ts";
import {
  type PrincipalId,
  type PrincipalRegistrationRequest,
  type PrincipalRegistrationResult,
  profileEntityId,
} from "./registration/types.ts";
import type { AuthPreflight, RegistrationVerifyContext } from "./registration/verify.ts";

/** Passed to {@link AgentRelayDeps.onEvent} together with each dispatched event. */
export type AgentRelayEventHandlerCtx = {
  persistence: AgentRelayPersistence;
  persistenceClient: AgentRelayPersistenceClient;
  notificationBuffer?: AgentNotificationBufferPort;
  /** When set, agent inbox WebSocket fan-out (see {@link deliverAgentNotification} from inbox module). */
  inboxHub?: InboxFanoutPort;
  /** App-owned runtime handle(s); agent-relay does not interpret (e.g. SQLite `Database`). */
  appContext?: unknown;
};

export type AgentRelayDeps<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends AgentRelayAppEventConstraint = never,
> = {
  persistence: AgentRelayPersistence;
  /** Optional ticket-gated frame-channel hub (HMAC tickets, replay on re-join). */
  frameChannelHub?: FrameChannelHubPort;
  /** Optional inbound verification (registration / authenticated routes / inbox upgrade). */
  authPreflight?: AuthPreflight;
  notificationBuffer?: AgentNotificationBufferPort;
  inboxHub?: InboxFanoutPort;
  /** Opaque app runtime (passed through to {@link AgentRelayEventHandlerCtx.appContext}). */
  appContext?: unknown;
  onEvent?: (
    ctx: AgentRelayEventHandlerCtx,
    event: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>;
};

/**
 * Facade for persistence, optional frame-channel hub, inbox fan-out, and principal registration.
 * App layers (e.g. Atrium) compose Memories and hybrid search outside this package.
 */
export class AgentRelay<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends AgentRelayAppEventConstraint = never,
> {
  readonly persistence: AgentRelayPersistence;
  readonly persistenceClient: AgentRelayPersistenceClient;
  readonly frameChannelHub?: FrameChannelHubPort;
  readonly authPreflight?: AuthPreflight;
  readonly notificationBuffer?: AgentNotificationBufferPort;
  readonly inboxHub?: InboxFanoutPort;
  readonly appContext?: unknown;

  private readonly onEvent?: AgentRelayDeps<TProfile, TPost, TTopic, TAppEvent>["onEvent"];

  constructor(deps: AgentRelayDeps<TProfile, TPost, TTopic, TAppEvent>) {
    this.persistence = deps.persistence;
    this.persistenceClient = createAgentRelayPersistenceClient(deps.persistence);
    this.frameChannelHub = deps.frameChannelHub;
    this.authPreflight = deps.authPreflight;
    this.notificationBuffer = deps.notificationBuffer;
    this.inboxHub = deps.inboxHub;
    this.appContext = deps.appContext;
    this.onEvent = deps.onEvent;
  }

  private eventCtx(): AgentRelayEventHandlerCtx {
    return {
      persistence: this.persistence,
      persistenceClient: this.persistenceClient,
      notificationBuffer: this.notificationBuffer,
      inboxHub: this.inboxHub,
      appContext: this.appContext,
    };
  }

  /**
   * Dispatches to {@link AgentRelayDeps.onEvent}.
   */
  notify(event: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent>): void | Promise<void> {
    const ctx = this.eventCtx();
    const handler = this.onEvent;
    if (handler === undefined) {
      return;
    }
    return handler(ctx, event);
  }

  /**
   * Run optional {@link AgentRelayDeps.authPreflight}, emit
   * `swarm.registration.profile_build` so {@link AgentRelayDeps.onEvent} can call `payload.fulfill(profile)`,
   * then emit `swarm.profile.created` and ensure the principal is registered with the notification buffer.
   */
  async registerPrincipal(
    req: PrincipalRegistrationRequest,
    registrationExtra: Omit<RegistrationVerifyContext, "request">,
  ): Promise<PrincipalRegistrationResult<TProfile>> {
    if (this.authPreflight !== undefined) {
      await this.authPreflight.verifyRegistration({ request: req, ...registrationExtra });
    }
    const onEvent = this.onEvent;
    if (onEvent === undefined) {
      throw new Error(
        "AgentRelay: onEvent is required for registerPrincipal (handle swarm.registration.profile_build)",
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

      const buildEvent: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent> = {
        kind: AGENT_RELAY_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
        occurredAt: Date.now(),
        aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.registration, id: req.principalId },
        change: "created",
        source: "swarm",
        payload: { request: req, fulfill, reject: rej },
        correlationId: req.correlationId,
      };

      void Promise.resolve(onEvent(this.eventCtx(), buildEvent)).then(() => {
        if (!settled) {
          rej(
            new Error(
              "AgentRelay: onEvent must call fulfill(profile) or reject(reason) for swarm.registration.profile_build",
            ),
          );
        }
      }, rej);
    });

    const profileId = profileEntityId(profile);
    const createdEvent: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent> = {
      kind: AGENT_RELAY_EVENT_KIND.PROFILE_CREATED,
      occurredAt: Date.now(),
      aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.profile, id: profileId },
      change: "created",
      source: "swarm",
      payload: { profile },
      correlationId: req.correlationId,
    };
    await Promise.resolve(this.notify(createdEvent));
    await this.notificationBuffer?.ensureRegistered(req.principalId);
    return { principalId: req.principalId, profile, profileId };
  }

  /**
   * Queue a join ticket for another agent (e.g. after {@link FrameChannelHubPort.createChannel}).
   * Requires {@link AgentRelayDeps.notificationBuffer}.
   */
  async offerFrameChannelToPrincipal(params: {
    targetPrincipalId: PrincipalId;
    channelId: string;
    ticket: string;
    expiresAtMs?: number;
    fromPrincipalId?: PrincipalId;
  }): Promise<void> {
    const buf = this.notificationBuffer;
    if (buf === undefined) {
      throw new Error(
        "AgentRelay: notificationBuffer is required for offerFrameChannelToPrincipal",
      );
    }
    await buf.enqueue(params.targetPrincipalId, {
      kind: "room_ticket",
      payload: {
        channelId: params.channelId,
        ticket: params.ticket,
        expiresAtMs: params.expiresAtMs,
        issuedAtMs: Date.now(),
        fromPrincipalId: params.fromPrincipalId,
      },
    });
  }
}
