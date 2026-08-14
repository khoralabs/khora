import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { HostRegistrations } from "..";
import { NAMESPACE_REG_BY_PRINCIPAL, NAMESPACE_REG_BY_PROFILE } from "./id-conventions";
import type { ProjectionStore } from "./projection-store";

function readProfileId(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const v = (projection as Record<string, unknown>).profileId;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function readPrincipalId(projection: unknown): PrincipalId | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const v = (projection as Record<string, unknown>).principalId;
  return typeof v === "string" && v.length > 0 ? (v as PrincipalId) : undefined;
}

export function createRegistrationAdapter(
  store: ProjectionStore,
  db: Database,
  tenantKey: string,
): HostRegistrations {
  return {
    exists(principalId: PrincipalId): boolean {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_REG_BY_PRINCIPAL,
        principalId,
      );
      return found && readProfileId(projection) !== undefined;
    },

    upsert(principalId: PrincipalId, profileId: string): void {
      db.transaction(() => {
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_REG_BY_PRINCIPAL,
          entry_key: principalId,
          projection: { profileId },
        });
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_REG_BY_PROFILE,
          entry_key: profileId,
          projection: { principalId },
        });
      })();
    },

    delete(principalId: PrincipalId, profileId: string): void {
      db.transaction(() => {
        store.deleteRow(tenantKey, NAMESPACE_REG_BY_PRINCIPAL, principalId);
        store.deleteRow(tenantKey, NAMESPACE_REG_BY_PROFILE, profileId);
      })();
    },

    profileIdForPrincipal(principalId: PrincipalId): string | undefined {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_REG_BY_PRINCIPAL,
        principalId,
      );
      if (!found) return undefined;
      return readProfileId(projection);
    },

    principalForProfileId(profileId: string): PrincipalId | undefined {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_REG_BY_PROFILE,
        profileId,
      );
      if (!found) return undefined;
      return readPrincipalId(projection);
    },
  };
}
