import type { Database } from "bun:sqlite";
import type { AgentRelaySubjectSubscriptions, PrincipalId } from "@khoralabs/agent-relay";
import type { RelaySubscriptionEdgeStore } from "./relay-subscription-edge-store.ts";

export function createCatalogSubscriptionAdapter(
  edgeStore: RelaySubscriptionEdgeStore,
  db: Database,
  tenantKey: string,
): AgentRelaySubjectSubscriptions {
  return {
    listSubjectsForPrincipal(principalId: PrincipalId): string[] {
      return edgeStore.listSubjectsForPrincipal(tenantKey, principalId);
    },

    subscriberPrincipalsForSubject(
      subject: string,
      excludePrincipalId?: PrincipalId,
    ): PrincipalId[] {
      return edgeStore.listPrincipalsForSubject(tenantKey, subject, excludePrincipalId);
    },

    subscribe(principalId: PrincipalId, subject: string): void {
      db.transaction(() => {
        edgeStore.insertEdge(tenantKey, principalId, subject);
      })();
    },

    unsubscribe(principalId: PrincipalId, subject: string): void {
      db.transaction(() => {
        edgeStore.deleteEdge(tenantKey, principalId, subject);
      })();
    },
  };
}
