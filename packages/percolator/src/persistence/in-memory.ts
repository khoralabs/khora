import type { StandingQuery } from "../types";
import type { PercolatorPersistence } from "./port";

export function createInMemoryPercolatorPersistence(): PercolatorPersistence {
  const queries = new Map<string, StandingQuery>();
  const termsByQuery = new Map<string, Set<string>>();
  const queryIdsByTerm = new Map<string, Set<string>>();

  return {
    withTransaction<T>(fn: () => T): T {
      return fn();
    },

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
      const terms = termsByQuery.get(queryId);
      if (terms !== undefined) {
        for (const term of terms) {
          queryIdsByTerm.get(term)?.delete(queryId);
        }
      }
      termsByQuery.delete(queryId);
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

    replaceQueryTerms(queryId: string, terms: readonly string[]): void {
      const prev = termsByQuery.get(queryId);
      if (prev !== undefined) {
        for (const term of prev) {
          queryIdsByTerm.get(term)?.delete(queryId);
        }
      }
      const next = new Set(terms);
      termsByQuery.set(queryId, next);
      for (const term of next) {
        let ids = queryIdsByTerm.get(term);
        if (ids === undefined) {
          ids = new Set();
          queryIdsByTerm.set(term, ids);
        }
        ids.add(queryId);
      }
    },

    findQueryIdsByAnyTerm(terms: readonly string[]): string[] {
      const out = new Set<string>();
      for (const term of terms) {
        const ids = queryIdsByTerm.get(term);
        if (ids === undefined) continue;
        for (const id of ids) out.add(id);
      }
      return [...out];
    },
  };
}
