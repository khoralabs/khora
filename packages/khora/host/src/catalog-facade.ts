import type { Database } from "bun:sqlite";
import type { HostPersistence } from "@khoralabs/host-runtime";
import { normalizeUsername } from "@khoralabs/khora-contracts";
import {
  RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  type RelayCatalogProjectionStore,
  type RelayPrincipalLifecycle,
  registerAgentOnColonnadePersistence,
  USERNAME_INDEX_TENANT_KEY,
} from "@khoralabs/relay-colonnade";

/** Catalog operations used by HTTP adapters; relay projection keys stay inside the host. */
export type KhoraHostCatalogApi = {
  lookupPrincipalIdByNormalizedUsername(normalized: string): string | undefined;
  lookupNormalizedUsernameForPrincipal(principalId: string): string | undefined;
  rollbackUsernameMapsAfterFailedRegistration(
    principalId: string,
    priorNormalizedUsername: string | undefined,
  ): void;
  applyProfileUsernameAndMaps(input: {
    principalId: string;
    username: string;
    profileUpsert: { id: string; bodyJson: string };
  }): void;
  phase1UnregisterPrincipal(principalId: string): void;
};

export function createKhoraCatalogApi(deps: {
  persistence: HostPersistence;
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  tenantKey: string;
  principalLifecycle: RelayPrincipalLifecycle;
}): KhoraHostCatalogApi {
  const { persistence, projectionStore, catalogDb, tenantKey, principalLifecycle } = deps;

  function lookupPrincipalIdByNormalizedUsername(normalized: string): string | undefined {
    const hit = projectionStore.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
      normalized,
    );
    if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
      return undefined;
    }
    const pid = (hit.projection as Record<string, unknown>).principalId;
    return typeof pid === "string" ? pid : undefined;
  }

  function lookupNormalizedUsernameForPrincipal(principalId: string): string | undefined {
    const hit = projectionStore.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
      principalId,
    );
    if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
      return undefined;
    }
    const u = (hit.projection as Record<string, unknown>).username;
    return typeof u === "string" ? u : undefined;
  }

  function rollbackUsernameMapsAfterFailedRegistration(
    principalId: string,
    priorNormalizedUsername: string | undefined,
  ): void {
    const current = lookupNormalizedUsernameForPrincipal(principalId);
    if (current === undefined) return;
    projectionStore.deleteRow(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
      principalId,
    );
    projectionStore.deleteRow(
      USERNAME_INDEX_TENANT_KEY,
      RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
      current,
    );
    if (priorNormalizedUsername === undefined) return;
    const username = normalizeUsername(priorNormalizedUsername);
    projectionStore.upsert({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      namespace: RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
      entry_key: username,
      projection: { principalId },
    });
    projectionStore.upsert({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      namespace: RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
      entry_key: principalId,
      projection: { username },
    });
  }

  return {
    lookupPrincipalIdByNormalizedUsername,
    lookupNormalizedUsernameForPrincipal,
    rollbackUsernameMapsAfterFailedRegistration,
    applyProfileUsernameAndMaps(input) {
      registerAgentOnColonnadePersistence(persistence, catalogDb, projectionStore, {
        principalId: input.principalId,
        username: input.username,
        profileUpsert: input.profileUpsert,
      });
    },
    phase1UnregisterPrincipal(principalId) {
      principalLifecycle.enqueueTeardown(principalId);
    },
  };
}
