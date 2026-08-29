import type { InboxFanoutPort } from "../inbox/fanout-port";
import type { NotificationBufferPort } from "../inbox/notification-buffer";
import {
  createHostPersistenceClient,
  type HostPersistenceClient,
} from "../persistence/core/client";
import type { HostPersistence } from "../persistence/core/port";
import {
  type PrincipalRegistrationRequest,
  type PrincipalRegistrationResult,
  profileEntityId,
} from "../registration/types";
import { HOST_AGGREGATE_DOMAIN } from "./aggregate-domains";
import type { AuthPreflight, RegistrationVerifyContext } from "./auth-preflight";
import { HOST_EVENT_KIND, type HostAppEventConstraint, type HostEventUnion } from "./events";

/** Passed to {@link HostRuntimeDeps.onEvent} together with each dispatched event. */
export type HostRuntimeEventHandlerCtx = {
  persistence: HostPersistence;
  persistenceClient: HostPersistenceClient;
  notificationBuffer?: NotificationBufferPort;
  /** When set, principal inbox WebSocket fan-out (see {@link deliverNotification} from inbox module). */
  inboxHub?: InboxFanoutPort;
  /** App-owned runtime handle(s); khora-host does not interpret (e.g. SQLite `Database`). */
  appContext?: unknown;
};

export type HostRuntimeDeps<
  TProfile = unknown,
  TAppEvent extends HostAppEventConstraint = never,
> = {
  persistence: HostPersistence;
  /** Optional inbound verification (registration / authenticated routes / inbox upgrade). */
  authPreflight?: AuthPreflight;
  notificationBuffer?: NotificationBufferPort;
  inboxHub?: InboxFanoutPort;
  /** Opaque app runtime (passed through to {@link HostRuntimeEventHandlerCtx.appContext}). */
  appContext?: unknown;
  onEvent?: (
    ctx: HostRuntimeEventHandlerCtx,
    event: HostEventUnion<TProfile, TAppEvent>,
  ) => void | Promise<void>;
};

/**
 * Facade for host persistence, inbox fan-out, and principal registration.
 */
export class HostRuntime<TProfile = unknown, TAppEvent extends HostAppEventConstraint = never> {
  readonly persistence: HostPersistence;
  readonly persistenceClient: HostPersistenceClient;
  readonly authPreflight?: AuthPreflight;
  readonly notificationBuffer?: NotificationBufferPort;
  readonly inboxHub?: InboxFanoutPort;
  readonly appContext?: unknown;

  private readonly onEvent?: HostRuntimeDeps<TProfile, TAppEvent>["onEvent"];

  constructor(deps: HostRuntimeDeps<TProfile, TAppEvent>) {
    this.persistence = deps.persistence;
    this.persistenceClient = createHostPersistenceClient(deps.persistence);
    this.authPreflight = deps.authPreflight;
    this.notificationBuffer = deps.notificationBuffer;
    this.inboxHub = deps.inboxHub;
    this.appContext = deps.appContext;
    this.onEvent = deps.onEvent;
  }

  private eventCtx(): HostRuntimeEventHandlerCtx {
    return {
      persistence: this.persistence,
      persistenceClient: this.persistenceClient,
      notificationBuffer: this.notificationBuffer,
      inboxHub: this.inboxHub,
      appContext: this.appContext,
    };
  }

  /**
   * Dispatches to {@link HostRuntimeDeps.onEvent}.
   */
  notify(event: HostEventUnion<TProfile, TAppEvent>): void | Promise<void> {
    const ctx = this.eventCtx();
    const handler = this.onEvent;
    if (handler === undefined) {
      return;
    }
    return handler(ctx, event);
  }

  /**
   * Run optional {@link HostRuntimeDeps.authPreflight}, emit
   * `host.registration.profile_build` so {@link HostRuntimeDeps.onEvent} can call `payload.fulfill(profile)`,
   * then emit `host.profile.created` and ensure the principal is registered with the notification buffer.
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
        "HostRuntime: onEvent is required for registerPrincipal (handle host.registration.profile_build)",
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

      const buildEvent: HostEventUnion<TProfile, TAppEvent> = {
        kind: HOST_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
        occurredAt: Date.now(),
        aggregate: { domain: HOST_AGGREGATE_DOMAIN.registration, id: req.principalId },
        change: "created",
        source: "host",
        payload: { request: req, fulfill, reject: rej },
        correlationId: req.correlationId,
      };

      void Promise.resolve(onEvent(this.eventCtx(), buildEvent)).then(() => {
        if (!settled) {
          rej(
            new Error(
              "HostRuntime: onEvent must call fulfill(profile) or reject(reason) for host.registration.profile_build",
            ),
          );
        }
      }, rej);
    });

    const profileId = profileEntityId(profile);
    const createdEvent: HostEventUnion<TProfile, TAppEvent> = {
      kind: HOST_EVENT_KIND.PROFILE_CREATED,
      occurredAt: Date.now(),
      aggregate: { domain: HOST_AGGREGATE_DOMAIN.profile, id: profileId },
      change: "created",
      source: "host",
      payload: { profile },
      correlationId: req.correlationId,
    };
    await Promise.resolve(this.notify(createdEvent));
    await this.notificationBuffer?.ensureRegistered(req.principalId);
    return { principalId: req.principalId, profile, profileId };
  }
}
