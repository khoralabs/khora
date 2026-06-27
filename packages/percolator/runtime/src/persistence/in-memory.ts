import type { StandingQuery } from "../types";
import type { PercolatorPersistence } from "./port";

export function createInMemoryPercolatorPersistence(): PercolatorPersistence {
  const queries = new Map<string, StandingQuery>();

  return {
    upsertQuery(query: StandingQuery): void {
      queries.set(query.id, { ...query });
    },

    deactivateQuery(queryId: string, now: number): void {
      const cur = queries.get(queryId);
      if (cur === undefined) return;
      queries.set(queryId, { ...cur, active: false, updatedAtMs: now });
    },

    deleteQuery(queryId: string): void {
      queries.delete(queryId);
    },

    getQuery(queryId: string): StandingQuery | undefined {
      const q = queries.get(queryId);
      return q === undefined ? undefined : { ...q };
    },

    listQueriesByOwner(ownerId: string): StandingQuery[] {
      return [...queries.values()].filter((q) => q.ownerId === ownerId).map((q) => ({ ...q }));
    },

    listActiveQueries(now: number): StandingQuery[] {
      return [...queries.values()]
        .filter((q) => q.active && (q.expiresAtMs === undefined || q.expiresAtMs > now))
        .map((q) => ({ ...q }));
    },
  };
}
