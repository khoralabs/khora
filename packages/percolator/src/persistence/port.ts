import type { StandingQuery } from "../types";

export type PercolatorPersistence = {
  withTransaction<T>(fn: () => T): T;

  upsertQuery(query: StandingQuery): void;
  deactivateQuery(queryId: string, now: number): void;
  deleteQuery(queryId: string): void;
  getQuery(queryId: string): StandingQuery | undefined;
  listQueriesByOwner(ownerId: string): StandingQuery[];
  /** Active, unexpired queries — used for exhaustive evaluation. */
  listActiveQueries(now: number): StandingQuery[];

  /** Inverted index maintenance (recall-safe prefilter for later). */
  replaceQueryTerms(queryId: string, terms: readonly string[]): void;
  findQueryIdsByAnyTerm(terms: readonly string[]): string[];
};
