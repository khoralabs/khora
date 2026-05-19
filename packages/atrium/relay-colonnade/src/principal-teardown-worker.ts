import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { SqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import type { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store.ts";
import type { RelaySubscriptionEdgeStore } from "./relay-subscription-edge-store.ts";
import {
  deletePrincipalTeardownJob,
  markPrincipalTeardownJobPendingAfterFailure,
  tryClaimNextPendingPrincipalTeardownJob,
} from "./principal-teardown-jobs.ts";
import { cascadeUnregisterColonnadePrincipalWithProfile } from "./social-unregister.ts";

export type PrincipalTeardownWorkerHandle = { stop(): void };

export function startPrincipalTeardownWorker(opts: {
  catalogDb: Database;
  framesDb: Database;
  projectionStore: RelayCatalogProjectionStore;
  subscriptionEdgeStore: RelaySubscriptionEdgeStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  persistence: AgentRelayPersistence;
  tenantKey: string;
  cluster: SqliteColonnadeCluster;
  intervalMs?: number;
}): PrincipalTeardownWorkerHandle {
  const intervalMs = opts.intervalMs ?? 500;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    void (async () => {
      const nowMs = Date.now();
      const claimed = tryClaimNextPendingPrincipalTeardownJob(opts.catalogDb, nowMs);
      if (claimed === undefined) return;
      try {
        cascadeUnregisterColonnadePrincipalWithProfile({
          persistence: opts.persistence,
          projectionStore: opts.projectionStore,
          subscriptionEdgeStore: opts.subscriptionEdgeStore,
          principalChannelStore: opts.principalChannelStore,
          catalogDb: opts.catalogDb,
          framesDb: opts.framesDb,
          tenantKey: opts.tenantKey,
          principalId: claimed.did,
          profileId: claimed.profileId,
        });
        const cellId = opts.cluster.assignPrincipalToCell(claimed.did);
        await opts.cluster.resolveCell(cellId).purgePrincipal(claimed.did);
        deletePrincipalTeardownJob(opts.catalogDb, claimed.did);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markPrincipalTeardownJobPendingAfterFailure(opts.catalogDb, claimed.did, nowMs, msg);
      }
    })();
  };
  const id = setInterval(tick, intervalMs);
  return {
    stop(): void {
      stopped = true;
      clearInterval(id);
    },
  };
}
