import type { Database } from "bun:sqlite";
import type { AgentRelaySubjectSubscriptions, PrincipalId } from "@khoralabs/agent-relay";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import {
  RELAY_NAMESPACE_SUBS_BY_PRINCIPAL,
  RELAY_NAMESPACE_SUBS_BY_SUBJECT,
} from "./relay-id-conventions.ts";

export const RELAY_CATALOG_SUBS_BY_PRINCIPAL = RELAY_NAMESPACE_SUBS_BY_PRINCIPAL;
export const RELAY_CATALOG_SUBS_BY_SUBJECT = RELAY_NAMESPACE_SUBS_BY_SUBJECT;

const NAMESPACE_BY_PRINCIPAL = RELAY_NAMESPACE_SUBS_BY_PRINCIPAL;
const NAMESPACE_BY_SUBJECT = RELAY_NAMESPACE_SUBS_BY_SUBJECT;

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
  store: RelayCatalogProjectionStore,
  db: Database,
  tenantKey: string,
): AgentRelaySubjectSubscriptions {
  return {
    listSubjectsForPrincipal(principalId: PrincipalId): string[] {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_PRINCIPAL,
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
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_SUBJECT,
        subject,
      );
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
        const pRow = store.lookupProjection(tenantKey, NAMESPACE_BY_PRINCIPAL, principalId);
        const subjects = new Set(pRow.found ? readStringSet(pRow.projection, "subjects") : []);
        subjects.add(subject);
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_BY_PRINCIPAL,
          entry_key: principalId,
          projection: { subjects: [...subjects] },
        });

        const sRow = store.lookupProjection(tenantKey, NAMESPACE_BY_SUBJECT, subject);
        const principals = new Set(sRow.found ? readStringSet(sRow.projection, "principals") : []);
        principals.add(principalId);
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_BY_SUBJECT,
          entry_key: subject,
          projection: { principals: [...principals] },
        });
      })();
    },

    unsubscribe(principalId: PrincipalId, subject: string): void {
      db.transaction(() => {
        const pRow = store.lookupProjection(tenantKey, NAMESPACE_BY_PRINCIPAL, principalId);
        if (pRow.found) {
          const subjects = readStringSet(pRow.projection, "subjects").filter((s) => s !== subject);
          store.upsert({
            tenant_key: tenantKey,
            namespace: NAMESPACE_BY_PRINCIPAL,
            entry_key: principalId,
            projection: { subjects },
          });
        }

        const sRow = store.lookupProjection(tenantKey, NAMESPACE_BY_SUBJECT, subject);
        if (sRow.found) {
          const principals = readStringSet(sRow.projection, "principals").filter(
            (p) => p !== principalId,
          );
          store.upsert({
            tenant_key: tenantKey,
            namespace: NAMESPACE_BY_SUBJECT,
            entry_key: subject,
            projection: { principals },
          });
        }
      })();
    },
  };
}
