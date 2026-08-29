import { isFilterOnlyMode } from "../../core/filters";
import type { StandingQuery } from "../../core/types";
import type { PercolatorPersistence } from "./port";

export function createInMemoryPercolatorPersistence(): PercolatorPersistence {
  const queries = new Map<string, StandingQuery>();

  return {
    async upsertQuery(query: StandingQuery): Promise<void> {
      queries.set(query.id, { ...query });
    },

    async deactivateQuery(queryId: string, now: number): Promise<void> {
      const cur = queries.get(queryId);
      if (cur === undefined) return;
      queries.set(queryId, { ...cur, active: false, updatedAtMs: now });
    },

    async deleteQuery(queryId: string): Promise<void> {
      queries.delete(queryId);
    },

    async getQuery(queryId: string): Promise<StandingQuery | undefined> {
      const q = queries.get(queryId);
      return q === undefined ? undefined : { ...q };
    },

    async listQueriesByOwner(ownerId: string): Promise<StandingQuery[]> {
      return [...queries.values()].filter((q) => q.ownerId === ownerId).map((q) => ({ ...q }));
    },

    async listActiveFilterQueries(now: number): Promise<StandingQuery[]> {
      return [...queries.values()]
        .filter(
          (q) =>
            q.active &&
            (q.expiresAtMs === undefined || q.expiresAtMs > now) &&
            isFilterOnlyMode(q.search),
        )
        .map((q) => ({ ...q }));
    },

    async listActiveSemanticQueries(now: number): Promise<StandingQuery[]> {
      return [...queries.values()]
        .filter(
          (q) =>
            q.active &&
            (q.expiresAtMs === undefined || q.expiresAtMs > now) &&
            !isFilterOnlyMode(q.search),
        )
        .map((q) => ({ ...q }));
    },
  };
}
