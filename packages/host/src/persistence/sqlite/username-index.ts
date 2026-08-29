import type { PrincipalId } from "@khoralabs/khora-contracts";
import {
  NAMESPACE_PRINCIPAL_TO_USERNAME,
  NAMESPACE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "../core/id-conventions";
import type { UsernameIndexPort } from "../core/port";
import type { ProjectionStore } from "./projection-store";

export function createUsernameIndex(store: ProjectionStore): UsernameIndexPort {
  function readPrincipalId(projection: unknown): PrincipalId | undefined {
    if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
      return undefined;
    }
    const v = (projection as Record<string, unknown>).principalId;
    return typeof v === "string" && v.length > 0 ? (v as PrincipalId) : undefined;
  }

  function readUsername(projection: unknown): string | undefined {
    if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
      return undefined;
    }
    const v = (projection as Record<string, unknown>).username;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  }

  return {
    lookupByUsername(normalizedUsername: string): PrincipalId | undefined {
      const { found, projection } = store.lookupProjection(
        USERNAME_INDEX_TENANT_KEY,
        NAMESPACE_USERNAME_TO_PRINCIPAL,
        normalizedUsername,
      );
      if (!found) return undefined;
      return readPrincipalId(projection);
    },

    lookupByPrincipal(principalId: PrincipalId): string | undefined {
      const { found, projection } = store.lookupProjection(
        USERNAME_INDEX_TENANT_KEY,
        NAMESPACE_PRINCIPAL_TO_USERNAME,
        principalId,
      );
      if (!found) return undefined;
      return readUsername(projection);
    },

    setForPrincipal(principalId: PrincipalId, normalizedUsername: string): void {
      store.upsert({
        tenant_key: USERNAME_INDEX_TENANT_KEY,
        namespace: NAMESPACE_USERNAME_TO_PRINCIPAL,
        entry_key: normalizedUsername,
        projection: { principalId },
      });
      store.upsert({
        tenant_key: USERNAME_INDEX_TENANT_KEY,
        namespace: NAMESPACE_PRINCIPAL_TO_USERNAME,
        entry_key: principalId,
        projection: { username: normalizedUsername },
      });
    },

    deleteForPrincipal(principalId: PrincipalId): void {
      const username = (() => {
        const { found, projection } = store.lookupProjection(
          USERNAME_INDEX_TENANT_KEY,
          NAMESPACE_PRINCIPAL_TO_USERNAME,
          principalId,
        );
        if (!found) return undefined;
        return readUsername(projection);
      })();
      store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_PRINCIPAL_TO_USERNAME, principalId);
      if (username !== undefined) {
        store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_USERNAME_TO_PRINCIPAL, username);
      }
    },

    rollbackForPrincipal(
      principalId: PrincipalId,
      priorNormalizedUsername: string | undefined,
    ): void {
      const current = (() => {
        const { found, projection } = store.lookupProjection(
          USERNAME_INDEX_TENANT_KEY,
          NAMESPACE_PRINCIPAL_TO_USERNAME,
          principalId,
        );
        if (!found) return undefined;
        return readUsername(projection);
      })();

      if (current !== undefined) {
        store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_USERNAME_TO_PRINCIPAL, current);
      }

      if (priorNormalizedUsername !== undefined) {
        store.upsert({
          tenant_key: USERNAME_INDEX_TENANT_KEY,
          namespace: NAMESPACE_USERNAME_TO_PRINCIPAL,
          entry_key: priorNormalizedUsername,
          projection: { principalId },
        });
        store.upsert({
          tenant_key: USERNAME_INDEX_TENANT_KEY,
          namespace: NAMESPACE_PRINCIPAL_TO_USERNAME,
          entry_key: principalId,
          projection: { username: priorNormalizedUsername },
        });
      } else {
        store.deleteRow(USERNAME_INDEX_TENANT_KEY, NAMESPACE_PRINCIPAL_TO_USERNAME, principalId);
      }
    },
  };
}
