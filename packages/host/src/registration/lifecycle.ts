import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { KhoraHostPersistence } from "../persistence/core/port";

/**
 * Behavior contract for principal registration teardown.
 * Phase 1 (enqueueTeardown) clears registration data synchronously and enqueues a durable job.
 * Phase 2 (runNextTeardownJob) performs the full async cascade (social graph, cell purge).
 * Implementation and persistence strategy are chosen by the server.
 */
export type PrincipalLifecycle = {
  /** Phase 1: clear registration + username index, enqueue durable teardown job. Returns false if principal not found. */
  enqueueTeardown(principalId: PrincipalId): boolean;
  /** Returns false when the author has no registration or has an active teardown job in progress. */
  isPostPointerDeliverable(authorPrincipalId: PrincipalId | undefined): boolean;
  /** Claim one pending teardown job, run phase 2 cascade + cell purge, finalize job row. */
  runNextTeardownJob(): Promise<boolean>;
  /** Eager full teardown without the job queue (admin / tests). */
  cascadeTeardownNow(principalId: PrincipalId): boolean;
};

export type PrincipalLifecycleDeps = {
  readonly persistence: KhoraHostPersistence;
  /** Purge all colonnade cell data for the given principal (async; called during phase 2). */
  readonly purgePrincipalCells: (principalId: PrincipalId) => Promise<void>;
  /** Called at the start of principal teardown cascade (e.g. deactivate percolator queries). */
  readonly onPrincipalTeardown?: (
    principalId: PrincipalId,
    profileId: string,
  ) => void | Promise<void>;
  /**
   * Called synchronously during phase 1 (enqueue) and at the start of cascade teardown.
   * Use for side-effects that must happen immediately (e.g. invalidate invite tokens).
   */
  readonly onPhase1Teardown?: (principalId: PrincipalId, profileId: string) => void;
};

async function cascadeCleanup(
  deps: PrincipalLifecycleDeps,
  principalId: PrincipalId,
  profileId: string,
): Promise<void> {
  await deps.onPrincipalTeardown?.(principalId, profileId);
  deps.onPhase1Teardown?.(principalId, profileId);

  const rels = deps.persistence.social.listRelationshipsForPrincipal(principalId);
  for (const r of rels) {
    deps.persistence.social.deleteRelationship(r.channelId);
  }

  deps.persistence.usernameIndex.deleteForPrincipal(principalId);
  deps.persistence.registrations.delete(principalId, profileId);
  deps.persistence.profiles.deleteById(profileId);
}

export function createPrincipalLifecycle(deps: PrincipalLifecycleDeps): PrincipalLifecycle {
  return {
    enqueueTeardown(principalId: PrincipalId): boolean {
      const profileId = deps.persistence.registrations.profileIdForPrincipal(principalId);
      if (profileId === undefined) {
        return false;
      }
      deps.persistence.phase1Unregister(principalId, profileId, Date.now());
      deps.onPhase1Teardown?.(principalId, profileId);
      return true;
    },

    isPostPointerDeliverable(authorPrincipalId: PrincipalId | undefined): boolean {
      if (authorPrincipalId === undefined || authorPrincipalId.length === 0) {
        return false;
      }
      if (!deps.persistence.registrations.exists(authorPrincipalId)) {
        return false;
      }
      if (deps.persistence.teardownQueue.hasActiveJob(authorPrincipalId)) {
        return false;
      }
      return true;
    },

    async runNextTeardownJob(): Promise<boolean> {
      const nowMs = Date.now();
      const claimed = deps.persistence.teardownQueue.tryClaimNext(nowMs);
      if (claimed === undefined) {
        return false;
      }
      try {
        await cascadeCleanup(deps, claimed.principalId, claimed.profileId);
        await deps.purgePrincipalCells(claimed.principalId);
        deps.persistence.teardownQueue.complete(claimed.principalId);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.persistence.teardownQueue.failAndRequeue(claimed.principalId, nowMs, msg);
        return false;
      }
    },

    cascadeTeardownNow(principalId: PrincipalId): boolean {
      const profileId = deps.persistence.registrations.profileIdForPrincipal(principalId);
      if (profileId === undefined) {
        return false;
      }
      void cascadeCleanup(deps, principalId, profileId);
      return true;
    },
  };
}
