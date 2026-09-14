import type { PercolatorPersistence } from "../persistence/core/port";
import { DEFAULT_MIN_SCORE, FILTER_ONLY_MATCH_SCORE } from "./constants";
import { isFilterOnlyMode, passesSearchFilters } from "./filters";
import { scoreCandidateAgainstSearch } from "./score";
import type {
  PercolatorCandidate,
  PercolatorMatch,
  PercolatorOwnerMatch,
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
  evaluateCandidateStream(
    candidate: PercolatorCandidate,
    opts?: { pageSize?: number; now?: number },
  ): AsyncIterable<PercolatorOwnerMatch>;
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

  async function* queryStream(
    mode: "filter-only" | "semantic",
    now: number,
    pageSize: number,
  ): AsyncGenerator<StandingQuery> {
    let afterOwnerOrdinal: number | undefined;
    let afterId: string | undefined;
    while (true) {
      const page = await persistence.scanActiveQueries({
        mode,
        now,
        ...(afterOwnerOrdinal !== undefined ? { afterOwnerOrdinal } : {}),
        ...(afterId !== undefined ? { afterId } : {}),
        limit: pageSize,
      });
      for (const query of page) yield query;
      const last = page.at(-1);
      if (last === undefined || page.length < pageSize) return;
      afterOwnerOrdinal = last.ownerOrdinal;
      afterId = last.id;
    }
  }

  async function matchQuery(
    query: StandingQuery,
    candidate: PercolatorCandidate,
  ): Promise<PercolatorMatch | undefined> {
    if (query.ownerId === candidate.authorId || !passesSearchFilters(candidate, query.search)) {
      return undefined;
    }
    if (isFilterOnlyMode(query.search)) {
      return FILTER_ONLY_MATCH_SCORE < query.minScore
        ? undefined
        : {
            queryId: query.id,
            ownerId: query.ownerId,
            candidateId: candidate.candidateId,
            score: FILTER_ONLY_MATCH_SCORE,
            matchMode: "filter-only",
          };
    }
    let queryVector = query.search.content.vector;
    const queryText = query.search.content.text?.trim() ?? "";
    if ((queryVector === undefined || queryVector.length === 0) && queryText && embedText) {
      queryVector = embeddingCache.get(query.id);
      if (queryVector === undefined) {
        queryVector = await embedText(queryText);
        embeddingCache.set(query.id, queryVector);
      }
    }
    const score = scoreCandidateAgainstSearch(candidate, query.search, queryVector);
    return score < query.minScore
      ? undefined
      : {
          queryId: query.id,
          ownerId: query.ownerId,
          candidateId: candidate.candidateId,
          score,
          matchMode: "semantic",
        };
  }

  const api: Percolator = {
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

    async evaluateCandidate(candidate, now = Date.now()) {
      const matches: PercolatorMatch[] = [];
      for await (const owner of api.evaluateCandidateStream(candidate, { now })) {
        matches.push(...owner.matches);
      }
      return matches;
    },

    async *evaluateCandidateStream(candidate, opts = {}) {
      const pageSize = opts.pageSize ?? 256;
      const filterStream = queryStream("filter-only", opts.now ?? Date.now(), pageSize);
      const semanticStream = queryStream("semantic", opts.now ?? Date.now(), pageSize);
      let filterNext = await filterStream.next();
      let semanticNext = await semanticStream.next();
      let current: PercolatorOwnerMatch | undefined;
      while (!filterNext.done || !semanticNext.done) {
        const useFilter =
          semanticNext.done ||
          (!filterNext.done &&
            (filterNext.value.ownerOrdinal < semanticNext.value.ownerOrdinal ||
              (filterNext.value.ownerOrdinal === semanticNext.value.ownerOrdinal &&
                filterNext.value.id <= semanticNext.value.id)));
        const query = useFilter ? filterNext.value : semanticNext.value;
        if (useFilter) filterNext = await filterStream.next();
        else semanticNext = await semanticStream.next();
        const match = await matchQuery(query, candidate);
        if (match === undefined) continue;
        if (current !== undefined && current.ownerOrdinal !== query.ownerOrdinal) {
          yield current;
          current = undefined;
        }
        current ??= { ownerId: query.ownerId, ownerOrdinal: query.ownerOrdinal, matches: [] };
        current.matches.push(match);
      }
      if (current !== undefined) yield current;
    },
  };
  return api;
}
