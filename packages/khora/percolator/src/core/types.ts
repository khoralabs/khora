import type { StandingSearchRequest } from "./search-request";

export type StandingQueryCreate = {
  id: string;
  ownerId: string;
  search: StandingSearchRequest;
  /** Poster-published threshold; falls back to search.options.minScore, then package default. */
  minScore?: number;
  expiresAtMs?: number;
};

export type StandingQuery = StandingQueryCreate & {
  minScore: number;
  active: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type PercolatorCandidate = {
  candidateId: string;
  authorId: string;
  namespace: string;
  labelKinds: string[];
  content: { text?: string; vector?: number[] };
  createdAtMs: number;
};

export type PercolatorMatch = {
  queryId: string;
  ownerId: string;
  candidateId: string;
  score: number;
  matchMode: "filter-only" | "semantic";
};
