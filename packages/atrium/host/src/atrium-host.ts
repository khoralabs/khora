import {
  AgentRelay,
  createAgentRelayPersistenceClient,
  createFrameChannelHub,
  createInboxWsHub,
} from "@khoralabs/agent-relay";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import { startPrincipalTeardownWorker } from "@khoralabs/relay-colonnade";
import type { AtriumHostDeps } from "./atrium-host-deps.ts";
import type { AtriumHostContext } from "./context.ts";
import { createAtriumRelayOnEvent } from "./on-event.ts";

export type { AtriumHostDeps } from "./atrium-host-deps.ts";

export function createAtriumHost(deps: AtriumHostDeps): AtriumHostContext {
  const _persistenceClient = createAgentRelayPersistenceClient(deps.persistence);
  const inboxHub = createInboxWsHub();
  const roomHub = createFrameChannelHub({
    hubPersistence: deps.persistence.frameChannelHubPersistence,
  });
  const host = new AgentRelay<AtriumProfile, AtriumPost, unknown, never>({
    persistence: deps.persistence,
    authPreflight: deps.auth.preflight,
    inboxHub,
    frameChannelHub: roomHub,
    onEvent: createAtriumRelayOnEvent({
      catalog: deps.catalog,
      tenantKey: deps.tenantKey,
      cluster: deps.cluster,
      publicationClient: deps.publicationClient,
      memories: deps.memories,
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
    roomHub,
    social: deps.social,
    invitesRepo: deps.invitesRepo,
    cluster: deps.cluster,
    publicationClient: deps.publicationClient,
    cellPoolCount: deps.cellPoolCount,
    principalLifecycle: deps.principalLifecycle,
    health: deps.health,
    adminStats: deps.adminStats,
    principalTeardownWorker,
    ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
    ...(deps.roomLifecycle !== undefined ? { roomLifecycle: deps.roomLifecycle } : {}),
    ...deps.catalog,
  };
}
