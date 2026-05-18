import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { RelayCatalogSourceMapStore } from "./catalog-source-map-store.ts";
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
  store: RelayCatalogSourceMapStore;
  persistence: AgentRelayPersistence;
  tenantKey: string;
  relayInboxSourceMapId: string;
  intervalMs?: number;
}): PrincipalTeardownWorkerHandle {
  const intervalMs = opts.intervalMs ?? 500;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    const nowMs = Date.now();
    const claimed = tryClaimNextPendingPrincipalTeardownJob(opts.catalogDb, nowMs);
    if (claimed === undefined) return;
    try {
      cascadeUnregisterColonnadePrincipalWithProfile({
        persistence: opts.persistence,
        store: opts.store,
        catalogDb: opts.catalogDb,
        framesDb: opts.framesDb,
        tenantKey: opts.tenantKey,
        principalId: claimed.did,
        profileId: claimed.profileId,
        relayInboxSourceMapId: opts.relayInboxSourceMapId,
      });
      deletePrincipalTeardownJob(opts.catalogDb, claimed.did);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      markPrincipalTeardownJobPendingAfterFailure(opts.catalogDb, claimed.did, nowMs, msg);
    }
  };
  const id = setInterval(tick, intervalMs);
  return {
    stop(): void {
      stopped = true;
      clearInterval(id);
    },
  };
}
