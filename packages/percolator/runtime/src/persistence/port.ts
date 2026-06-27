import type { StandingQuery } from "../types";

export type PercolatorPersistence = {
  upsertQuery(query: StandingQuery): void;
  deactivateQuery(queryId: string, now: number): void;
  deleteQuery(queryId: string): void;
  getQuery(queryId: string): StandingQuery | undefined;
  listQueriesByOwner(ownerId: string): StandingQuery[];
  /** Active, unexpired queries — used for exhaustive evaluation. */
  listActiveQueries(now: number): StandingQuery[];
};
