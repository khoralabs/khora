import type { Database } from "bun:sqlite";
import type { AgentRelayRegistrations, PrincipalId } from "@khoralabs/agent-relay";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store";
import {
  RELAY_NAMESPACE_REG_BY_PRINCIPAL,
  RELAY_NAMESPACE_REG_BY_PROFILE,
} from "./relay-id-conventions";

export const RELAY_CATALOG_REG_BY_PRINCIPAL = RELAY_NAMESPACE_REG_BY_PRINCIPAL;
export const RELAY_CATALOG_REG_BY_PROFILE = RELAY_NAMESPACE_REG_BY_PROFILE;

const NAMESPACE_BY_PRINCIPAL = RELAY_NAMESPACE_REG_BY_PRINCIPAL;
const NAMESPACE_BY_PROFILE = RELAY_NAMESPACE_REG_BY_PROFILE;

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

export function createCatalogRegistrationAdapter(
  store: RelayCatalogProjectionStore,
  db: Database,
  tenantKey: string,
): AgentRelayRegistrations {
  return {
    exists(principalId: PrincipalId): boolean {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_PRINCIPAL,
        principalId,
      );
      return found && readProfileId(projection) !== undefined;
    },

    upsert(principalId: PrincipalId, profileId: string): void {
      db.transaction(() => {
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_BY_PRINCIPAL,
          entry_key: principalId,
          projection: { profileId },
        });
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_BY_PROFILE,
          entry_key: profileId,
          projection: { principalId },
        });
      })();
    },

    profileIdForPrincipal(principalId: PrincipalId): string | undefined {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_PRINCIPAL,
        principalId,
      );
      if (!found) {
        return undefined;
      }
      return readProfileId(projection);
    },

    principalForProfileId(profileId: string): PrincipalId | undefined {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_PROFILE,
        profileId,
      );
      if (!found) {
        return undefined;
      }
      return readPrincipalId(projection);
    },
  };
}
