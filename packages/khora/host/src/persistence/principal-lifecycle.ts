import type { Database } from "bun:sqlite";
import type { SqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import type { HostPersistence, PrincipalId, PrincipalLifecycle } from "@khoralabs/host-runtime";
import type { CatalogProjectionStore } from "./catalog-projection-store";
import {
  NAMESPACE_ENTITY_PROFILE,
  NAMESPACE_PRINCIPAL_TO_USERNAME,
  NAMESPACE_REG_BY_PRINCIPAL,
  NAMESPACE_REG_BY_PROFILE,
  NAMESPACE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./id-conventions";
import {
  deletePrincipalTeardownJob,
  insertPendingPrincipalTeardownJob,
  markPrincipalTeardownJobPendingAfterFailure,
  principalHasActiveTeardownJob,
  tryClaimNextPendingPrincipalTeardownJob,
} from "./principal-teardown-jobs";
import type { SocialPrincipalChannelStore } from "./social-principal-channel-store";
import { purgeSocialRelationshipsForPrincipal } from "./social-relationship-persistence";

export type PrincipalLifecycleDeps = {
  readonly catalogDb: Database;
  readonly projectionStore: CatalogProjectionStore;
  readonly principalChannelStore: SocialPrincipalChannelStore;
  readonly persistence: HostPersistence;
  readonly tenantKey: string;
  readonly cluster: SqliteColonnadeCluster;
  /** Called at the start of principal teardown cascade (e.g. deactivate percolator standing queries). */
  readonly onPrincipalTeardown?: (principalId: PrincipalId) => void;
  /**
   * Called synchronously during phase 1 unregister and at the start of the cascade path.
   * Use this for cleanup that must happen immediately when a principal is removed
   * (e.g. invalidate invite tokens).
   */
  readonly onPhase1Teardown?: (principalId: PrincipalId) => void;
};

function readUsernameFromPrincipalMapProjection(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const u = (projection as Record<string, unknown>).username;
  return typeof u === "string" && u.length > 0 ? u : undefined;
}

function deletePrincipalUsernameIndexAndRegistrationRows(p: {
  projectionStore: CatalogProjectionStore;
  tenantKey: string;
  principalId: PrincipalId;
  profileId: string;
}): void {
  const { projectionStore: store, tenantKey, principalId, profileId } = p;
  const hit = store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    NAMESPACE_PRINCIPAL_TO_USERNAME,
    principalId,
  );
  const u = readUsernameFromPrincipalMapProjection(hit.projection);
  store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_PRINCIPAL_TO_USERNAME, principalId);
  if (u !== undefined) {
    store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_USERNAME_TO_PRINCIPAL, u);
  }
  store.deleteRow(tenantKey, NAMESPACE_REG_BY_PRINCIPAL, principalId);
  store.deleteRow(tenantKey, NAMESPACE_REG_BY_PROFILE, profileId);
  store.deleteRow(tenantKey, NAMESPACE_ENTITY_PROFILE, profileId);
}

function cascadeTeardownWithProfile(
  deps: PrincipalLifecycleDeps,
  principalId: PrincipalId,
  profileId: string,
): void {
  deps.onPrincipalTeardown?.(principalId);
  deps.onPhase1Teardown?.(principalId);

  purgeSocialRelationshipsForPrincipal({
    projectionStore: deps.projectionStore,
    principalChannelStore: deps.principalChannelStore,
    catalogDb: deps.catalogDb,
    tenantKey: deps.tenantKey,
    principalId,
  });

  deps.catalogDb.transaction(() => {
    deletePrincipalUsernameIndexAndRegistrationRows({
      projectionStore: deps.projectionStore,
      tenantKey: deps.tenantKey,
      principalId,
      profileId,
    });
  })();
}

export function createPrincipalLifecycle(deps: PrincipalLifecycleDeps): PrincipalLifecycle {
  return {
    enqueueTeardown(principalId: PrincipalId): boolean {
      const profileId = deps.persistence.registrations.profileIdForPrincipal(principalId);
      if (profileId === undefined) {
        return false;
      }
      const nowMs = Date.now();
      deps.catalogDb.transaction(() => {
        deletePrincipalUsernameIndexAndRegistrationRows({
          projectionStore: deps.projectionStore,
          tenantKey: deps.tenantKey,
          principalId,
          profileId,
        });
        insertPendingPrincipalTeardownJob(deps.catalogDb, {
          did: principalId,
          profileId,
          nowMs,
        });
      })();
      deps.onPhase1Teardown?.(principalId);
      return true;
    },

    isPostPointerDeliverable(authorPrincipalId: PrincipalId | undefined): boolean {
      const did = authorPrincipalId;
      if (did === undefined || did.length === 0) {
        return false;
      }
      if (!deps.persistence.registrations.exists(did)) {
        return false;
      }
      if (principalHasActiveTeardownJob(deps.catalogDb, did)) {
        return false;
      }
      return true;
    },

    async runNextTeardownJob(): Promise<boolean> {
      const nowMs = Date.now();
      const claimed = tryClaimNextPendingPrincipalTeardownJob(deps.catalogDb, nowMs);
      if (claimed === undefined) {
        return false;
      }
      try {
        cascadeTeardownWithProfile(deps, claimed.did, claimed.profileId);
        const cellId = deps.cluster.assignPrincipalToCell(claimed.did);
        await deps.cluster.resolveCell(cellId).purgePrincipal(claimed.did);
        deletePrincipalTeardownJob(deps.catalogDb, claimed.did);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markPrincipalTeardownJobPendingAfterFailure(deps.catalogDb, claimed.did, nowMs, msg);
        return false;
      }
    },

    cascadeTeardownNow(principalId: PrincipalId): boolean {
      const profileId = deps.persistence.registrations.profileIdForPrincipal(principalId);
      if (profileId === undefined) {
        return false;
      }
      cascadeTeardownWithProfile(deps, principalId, profileId);
      return true;
    },
  };
}
