import type { PrincipalLifecycle } from "@khoralabs/host-runtime";
import type { KhoraHostPersistence } from "./persistence/types";

/** Catalog operations used by HTTP adapters. */
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
  persistence: KhoraHostPersistence;
  principalLifecycle: PrincipalLifecycle;
}): KhoraHostCatalogApi {
  const { persistence, principalLifecycle } = deps;
  return {
    lookupPrincipalIdByNormalizedUsername(normalized) {
      return persistence.usernameIndex.lookupByUsername(normalized);
    },

    lookupNormalizedUsernameForPrincipal(principalId) {
      return persistence.usernameIndex.lookupByPrincipal(principalId);
    },

    rollbackUsernameMapsAfterFailedRegistration(principalId, priorNormalizedUsername) {
      persistence.usernameIndex.rollbackForPrincipal(principalId, priorNormalizedUsername);
    },

    applyProfileUsernameAndMaps(input) {
      persistence.registerAgent({
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
