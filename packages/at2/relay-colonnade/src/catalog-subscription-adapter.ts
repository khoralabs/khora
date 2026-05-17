import type { Database } from "bun:sqlite";
import type { AgentRelaySubjectSubscriptions, PrincipalId } from "@khoralabs/agent-relay";
import {
  type RelayCatalogSourceMapStore,
  relaySyntheticPointer,
} from "./catalog-source-map-store.ts";

export const RELAY_CATALOG_SUBS_BY_PRINCIPAL = "relay:subs:by-principal";
export const RELAY_CATALOG_SUBS_BY_SUBJECT = "relay:subs:by-subject";

const SOURCE_BY_PRINCIPAL = RELAY_CATALOG_SUBS_BY_PRINCIPAL;
const SOURCE_BY_SUBJECT = RELAY_CATALOG_SUBS_BY_SUBJECT;

function readStringSet(projection: unknown, key: "subjects" | "principals"): string[] {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return [];
  }
  const raw = (projection as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string");
}

export function createCatalogSubscriptionAdapter(
  store: RelayCatalogSourceMapStore,
  db: Database,
  tenantKey: string,
): AgentRelaySubjectSubscriptions {
  return {
    listSubjectsForPrincipal(principalId: PrincipalId): string[] {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        SOURCE_BY_PRINCIPAL,
        principalId,
      );
      if (!found) {
        return [];
      }
      return readStringSet(projection, "subjects");
    },

    subscriberPrincipalsForSubject(
      subject: string,
      excludePrincipalId?: PrincipalId,
    ): PrincipalId[] {
      const { found, projection } = store.lookupProjection(tenantKey, SOURCE_BY_SUBJECT, subject);
      if (!found) {
        return [];
      }
      let list = readStringSet(projection, "principals") as PrincipalId[];
      if (excludePrincipalId !== undefined) {
        list = list.filter((p) => p !== excludePrincipalId);
      }
      return list;
    },

    subscribe(principalId: PrincipalId, subject: string): void {
      db.transaction(() => {
        const subjPtr = relaySyntheticPointer(tenantKey, SOURCE_BY_SUBJECT, subject);
        const prinPtr = relaySyntheticPointer(tenantKey, SOURCE_BY_PRINCIPAL, principalId);

        const pRow = store.lookupProjection(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
        const subjects = new Set(pRow.found ? readStringSet(pRow.projection, "subjects") : []);
        subjects.add(subject);
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_BY_PRINCIPAL,
          entry_key: principalId,
          pointer: prinPtr,
          projection: { subjects: [...subjects] },
        });

        const sRow = store.lookupProjection(tenantKey, SOURCE_BY_SUBJECT, subject);
        const principals = new Set(sRow.found ? readStringSet(sRow.projection, "principals") : []);
        principals.add(principalId);
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_BY_SUBJECT,
          entry_key: subject,
          pointer: subjPtr,
          projection: { principals: [...principals] },
        });
      })();
    },

    unsubscribe(principalId: PrincipalId, subject: string): void {
      db.transaction(() => {
        const subjPtr = relaySyntheticPointer(tenantKey, SOURCE_BY_SUBJECT, subject);
        const prinPtr = relaySyntheticPointer(tenantKey, SOURCE_BY_PRINCIPAL, principalId);

        const pRow = store.lookupProjection(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
        if (pRow.found) {
          const subjects = readStringSet(pRow.projection, "subjects").filter((s) => s !== subject);
          store.upsertRow({
            tenant_key: tenantKey,
            source_map_id: SOURCE_BY_PRINCIPAL,
            entry_key: principalId,
            pointer: prinPtr,
            projection: { subjects },
          });
        }

        const sRow = store.lookupProjection(tenantKey, SOURCE_BY_SUBJECT, subject);
        if (sRow.found) {
          const principals = readStringSet(sRow.projection, "principals").filter(
            (p) => p !== principalId,
          );
          store.upsertRow({
            tenant_key: tenantKey,
            source_map_id: SOURCE_BY_SUBJECT,
            entry_key: subject,
            pointer: subjPtr,
            projection: { principals },
          });
        }
      })();
    },
  };
}
