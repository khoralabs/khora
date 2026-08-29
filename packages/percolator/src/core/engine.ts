import type { PercolatorPersistence } from "../persistence/core/port";
import { DEFAULT_MIN_SCORE, FILTER_ONLY_MATCH_SCORE } from "./constants";
import { isFilterOnlyMode, passesSearchFilters } from "./filters";
import { scoreCandidateAgainstSearch } from "./score";
import type {
  PercolatorCandidate,
  PercolatorMatch,
  StandingQuery,
  StandingQueryCreate,
} from "./types";

export type Percolator = {
  registerQuery(create: StandingQueryCreate, now?: number): Promise<StandingQuery>;
  deactivateQuery(queryId: string, now?: number): Promise<void>;
  deleteQuery(queryId: string): Promise<void>;
  getQuery(queryId: string): Promise<StandingQuery | undefined>;
  listQueriesByOwner(ownerId: string): Promise<StandingQuery[]>;
  evaluateCandidate(candidate: PercolatorCandidate, now?: number): Promise<PercolatorMatch[]>;
};

export type CreatePercolatorDeps = {
  persistence: PercolatorPersistence;
  embedText?: (text: string) => Promise<number[]>;
};

function resolveMinScore(create: StandingQueryCreate): number {
  if (create.minScore !== undefined) return create.minScore;
  if (create.search.options?.minScore !== undefined) return create.search.options.minScore;
  return DEFAULT_MIN_SCORE;
}

export function createPercolator(deps: CreatePercolatorDeps): Percolator {
  const { persistence, embedText } = deps;
  // queryId → embedded vector; evicted on any mutation of that query
  const embeddingCache = new Map<string, number[]>();

  return {
    async registerQuery(create: StandingQueryCreate, now = Date.now()): Promise<StandingQuery> {
      const minScore = resolveMinScore(create);
      const existing = await persistence.getQuery(create.id);
      const query: StandingQuery = {
        ...create,
        minScore,
        active: true,
        createdAtMs: existing?.createdAtMs ?? now,
        updatedAtMs: now,
      };
      embeddingCache.delete(create.id);
      await persistence.upsertQuery(query);
      return query;
    },

    async deactivateQuery(queryId: string, now = Date.now()): Promise<void> {
      embeddingCache.delete(queryId);
      await persistence.deactivateQuery(queryId, now);
    },

    async deleteQuery(queryId: string): Promise<void> {
      embeddingCache.delete(queryId);
      await persistence.deleteQuery(queryId);
    },

    async getQuery(queryId: string): Promise<StandingQuery | undefined> {
      return persistence.getQuery(queryId);
    },

    async listQueriesByOwner(ownerId: string): Promise<StandingQuery[]> {
      return persistence.listQueriesByOwner(ownerId);
    },

    async evaluateCandidate(
      candidate: PercolatorCandidate,
      now = Date.now(),
    ): Promise<PercolatorMatch[]> {
      const matches: PercolatorMatch[] = [];

      for (const query of await persistence.listActiveFilterQueries(now)) {
        if (query.ownerId === candidate.authorId) continue;
        if (!passesSearchFilters(candidate, query.search)) continue;
        if (FILTER_ONLY_MATCH_SCORE >= query.minScore) {
          matches.push({
            queryId: query.id,
            ownerId: query.ownerId,
            candidateId: candidate.candidateId,
            score: FILTER_ONLY_MATCH_SCORE,
            matchMode: "filter-only",
          });
        }
      }

      for (const query of await persistence.listActiveSemanticQueries(now)) {
        if (query.ownerId === candidate.authorId) continue;
        if (!passesSearchFilters(candidate, query.search)) continue;

        // isFilterOnlyMode should never be true here, but guard defensively
        if (isFilterOnlyMode(query.search)) continue;

        let queryVector: number[] | undefined = query.search.content.vector;
        const queryText = query.search.content.text?.trim() ?? "";
        if ((queryVector === undefined || queryVector.length === 0) && queryText.length > 0) {
          if (embedText !== undefined) {
            let cached = embeddingCache.get(query.id);
            if (cached === undefined) {
              cached = await embedText(queryText);
              embeddingCache.set(query.id, cached);
            }
            queryVector = cached;
          }
        }

        const score = scoreCandidateAgainstSearch(candidate, query.search, queryVector);
        if (score >= query.minScore) {
          matches.push({
            queryId: query.id,
            ownerId: query.ownerId,
            candidateId: candidate.candidateId,
            score,
            matchMode: "semantic",
          });
        }
      }

      return matches;
    },
  };
}
