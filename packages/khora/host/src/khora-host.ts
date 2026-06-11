import { createInboxWsHub, HostRuntime } from "@khoralabs/host-runtime";
import type { KhoraHostAppEvent, KhoraProfile } from "@khoralabs/khora-contracts";
import { startPrincipalTeardownWorker } from "@khoralabs/relay-colonnade";
import type { KhoraHostContext } from "./context";
import type { KhoraHostDeps } from "./khora-host-deps";
import { createKhoraRelayOnEvent } from "./on-event";

export type { KhoraHostDeps } from "./khora-host-deps";

export function createKhoraHost(deps: KhoraHostDeps): KhoraHostContext {
  const inboxHub = createInboxWsHub();
  const host = new HostRuntime<KhoraProfile, KhoraHostAppEvent>({
    persistence: deps.persistence,
    authPreflight: deps.auth.preflight,
    inboxHub,
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
    ...deps.catalog,
  };
}
