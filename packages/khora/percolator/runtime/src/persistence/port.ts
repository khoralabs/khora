import type { StandingQuery } from "../types";

export type PercolatorPersistence = {
  upsertQuery(query: StandingQuery): void;
  deactivateQuery(queryId: string, now: number): void;
  deleteQuery(queryId: string): void;
  getQuery(queryId: string): StandingQuery | undefined;
  listQueriesByOwner(ownerId: string): StandingQuery[];
  listActiveFilterQueries(now: number): StandingQuery[];
  listActiveSemanticQueries(now: number): StandingQuery[];
};
