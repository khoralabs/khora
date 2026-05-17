import type { Database } from "bun:sqlite";
import type { AgentRelayRegistrations, PrincipalId } from "@khoralabs/agent-relay";
import {
  type RelayCatalogSourceMapStore,
  relaySyntheticPointer,
} from "./catalog-source-map-store.ts";

const SOURCE_BY_PRINCIPAL = "relay:reg:by-principal";
const SOURCE_BY_PROFILE = "relay:reg:by-profile";

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
  store: RelayCatalogSourceMapStore,
  db: Database,
  tenantKey: string,
): AgentRelayRegistrations {
  return {
    exists(principalId: PrincipalId): boolean {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        SOURCE_BY_PRINCIPAL,
        principalId,
      );
      return found && readProfileId(projection) !== undefined;
    },

    upsert(principalId: PrincipalId, profileId: string): void {
      const ptrP = relaySyntheticPointer(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
      const ptrPr = relaySyntheticPointer(tenantKey, SOURCE_BY_PROFILE, profileId);
      db.transaction(() => {
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_BY_PRINCIPAL,
          entry_key: principalId,
          pointer: ptrP,
          projection: { profileId },
        });
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_BY_PROFILE,
          entry_key: profileId,
          pointer: ptrPr,
          projection: { principalId },
        });
      })();
    },

    profileIdForPrincipal(principalId: PrincipalId): string | undefined {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        SOURCE_BY_PRINCIPAL,
        principalId,
      );
      if (!found) {
        return undefined;
      }
      return readProfileId(projection);
    },

    principalForProfileId(profileId: string): PrincipalId | undefined {
      const { found, projection } = store.lookupProjection(tenantKey, SOURCE_BY_PROFILE, profileId);
      if (!found) {
        return undefined;
      }
      return readPrincipalId(projection);
    },
  };
}
