import type { KhoraHostAppEvent, KhoraProfile } from "@khoralabs/khora-contracts";
import type { KhoraHostContext } from "./context";
import type { KhoraHostDeps } from "./khora-host-deps";
import { createKhoraRelayOnEvent } from "./on-event";
import {
  createInboxWsHub,
  HostRuntime,
  type NotificationBufferPort,
  startPrincipalTeardownWorker,
} from "./runtime";

export type { KhoraHostDeps } from "./khora-host-deps";

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
      memories: deps.memories,
      percolator: deps.percolator,
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
    percolator: deps.percolator,
    ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
    ...deps.registration,
  };
}
