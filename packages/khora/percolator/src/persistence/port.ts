import type { StandingQuery } from "../types";

export type PercolatorPersistence = {
  upsertQuery(query: StandingQuery): Promise<void>;
  deactivateQuery(queryId: string, now: number): Promise<void>;
  deleteQuery(queryId: string): Promise<void>;
  getQuery(queryId: string): Promise<StandingQuery | undefined>;
  listQueriesByOwner(ownerId: string): Promise<StandingQuery[]>;
  listActiveFilterQueries(now: number): Promise<StandingQuery[]>;
  listActiveSemanticQueries(now: number): Promise<StandingQuery[]>;
};
