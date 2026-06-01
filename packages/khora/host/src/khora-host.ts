import {
  AgentRelay,
  createAgentRelayPersistenceClient,
  createFrameChannelHub,
  createInboxWsHub,
} from "@khoralabs/agent-relay";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import { startPrincipalTeardownWorker } from "@khoralabs/relay-colonnade";
import type { KhoraHostContext } from "./context";
import type { KhoraHostDeps } from "./khora-host-deps";
import { createKhoraRelayOnEvent } from "./on-event";

export type { KhoraHostDeps } from "./khora-host-deps";

export function createKhoraHost(deps: KhoraHostDeps): KhoraHostContext {
  const _persistenceClient = createAgentRelayPersistenceClient(deps.persistence);
  const inboxHub = createInboxWsHub();
  const roomHub = createFrameChannelHub({
    hubPersistence: deps.persistence.frameChannelHubPersistence,
  });
  const host = new AgentRelay<KhoraProfile, KhoraPost, unknown, never>({
    persistence: deps.persistence,
    authPreflight: deps.auth.preflight,
    inboxHub,
    frameChannelHub: roomHub,
    onEvent: createKhoraRelayOnEvent({
      catalog: deps.catalog,
      tenantKey: deps.tenantKey,
      cluster: deps.cluster,
      publicationClient: deps.publicationClient,
      memories: deps.memories,
      percolator: deps.percolator,
      social: deps.social,
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
    agentAccountStatus: deps.agentAccountStatus,
    hostSpec: deps.hostSpec,
    outboxPayloadCodec: deps.outboxPayloadCodec,
    principalTeardownWorker,
    percolator: deps.percolator,
    ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
    ...(deps.roomLifecycle !== undefined ? { roomLifecycle: deps.roomLifecycle } : {}),
    ...deps.catalog,
  };
}
