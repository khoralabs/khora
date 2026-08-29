import type { KhoraHostAppEvent, KhoraProfile } from "@khoralabs/khora-contracts";
import type { NotificationBufferPort } from "../inbox/notification-buffer";
import { createInboxWsHub } from "../inbox/ws-hub";
import { createKhoraRelayOnEvent } from "../posts/on-event";
import { startPrincipalTeardownWorker } from "../registration/teardown-worker";
import type { KhoraHostContext } from "./context";
import type { KhoraHostDeps } from "./deps";
import { HostRuntime } from "./runtime";

export type { KhoraHostDeps } from "./deps";

function createInMemoryNotificationBuffer(): NotificationBufferPort {
  let nextId = 1;
  return {
    async ensureRegistered() {},
    async enqueue() {
      return nextId++;
    },
    async dequeueBatch() {
      return [];
    },
  };
}

export function createKhoraHost(deps: KhoraHostDeps): KhoraHostContext {
  const inboxHub = createInboxWsHub();
  const notificationBuffer = createInMemoryNotificationBuffer();
  const host = new HostRuntime<KhoraProfile, KhoraHostAppEvent>({
    persistence: deps.persistence,
    authPreflight: deps.auth.preflight,
    inboxHub,
    notificationBuffer,
    onEvent: createKhoraRelayOnEvent({
      registration: deps.registration,
      tenantKey: deps.tenantKey,
      cluster: deps.cluster,
      publicationClient: deps.publicationClient,
      search: deps.search,
      subscriptions: deps.subscriptions,
      social: deps.persistence.social,
    }),
  });
  const runTeardownWorker = deps.startPrincipalTeardownWorker ?? true;
  const principalTeardownWorker = runTeardownWorker
    ? startPrincipalTeardownWorker({ lifecycle: deps.principalLifecycle })
    : { stop(): void {} };
  return {
    host,
    auth: deps.auth,
    tenantKey: deps.tenantKey,
    social: deps.persistence.social,
    invitesRepo: deps.invitesRepo,
    cluster: deps.cluster,
    publicationClient: deps.publicationClient,
    cellPoolCount: deps.cellPoolCount,
    principalLifecycle: deps.principalLifecycle,
    health: deps.health,
    adminStats: deps.adminStats,
    agentAccountStatus: deps.persistence.agentAccountStatus,
    hostSpec: deps.hostSpec,
    outboxPayloadCodec: deps.outboxPayloadCodec,
    principalTeardownWorker,
    subscriptions: deps.subscriptions,
    ...(deps.search !== undefined ? { search: deps.search } : {}),
    ...deps.registration,
  };
}
