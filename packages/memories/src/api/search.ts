import { fuseRrf, type RrfArm } from "@cfd/reciprocal-rank-fusion";
import type { Edge, Memory, SourceMap } from "../db/schema";
import { logger } from "../logger.js";
import type { HydratedNeighbor, NeighborFilter } from "../models/neighbor-search-types";
import type { MemoriesPersistence } from "../persistence/types";
import { elapsedMs } from "../timing.js";
import type { MutationCtx } from "./merge-memory";

/** When `true`, expand with no neighbor edge filters (any label, any direction). `false` omits neighbors. */
export type NeighborSearchOption<
  NODE_LABELS extends string = string,
  EDGE_LABELS extends string = string,
> = boolean | NeighborFilter<EDGE_LABELS, NODE_LABELS>;

export type SearchContent =
  | { text: string }
  | { vector: number[] }
  | { text: string; vector: number[] };

export interface SearchParams<
  NODE_LABELS extends string = string,
  EDGE_LABELS extends string = string,
> {
  namespace: string;
  content: SearchContent;
  options?: {
    topK?: number;
    minScore?: number;
    labels?: { all?: NODE_LABELS[]; some?: NODE_LABELS[] };
    neighbors?: NeighborSearchOption<NODE_LABELS, EDGE_LABELS>;
    /**
     * When neighbors are included, cap how many adjacent memories **per root hit** (each hit row
     * independently; not a shared budget across the whole result set). Omit = no cap.
     */
    maxNeighbors?: number;
    arms?: {
      vector?: number;
      lexical?: number;
    };
  };
}

export type SearchNeighborHit<
  NODE_LABELS extends string = string,
  EDGE_LABELS extends string = string,
> = Memory & {
  labels: NODE_LABELS[];
  edge: Edge & { label: EDGE_LABELS };
  /** Fused RRF score from scoped neighbor sub-search. */
  neighborScore?: number;
  /** Best-matching `source_map` within the neighbor memory. */
  matchedSourceMapId?: string;
};

export interface SearchHit<NODE_LABELS extends string = string, EDGE_LABELS extends string = string>
  extends SourceMap {
  score: number;
  memory: Memory;
  labels: NODE_LABELS[];
  neighbors?: Array<SearchNeighborHit<NODE_LABELS, EDGE_LABELS>>;
}

function matchesLabelFilter<LABEL extends string>(
  labels: readonly LABEL[],
  filter: { all?: LABEL[]; some?: LABEL[] } | undefined,
): boolean {
  if (!filter) return true;
  if (filter.all && !filter.all.every((label) => labels.includes(label))) {
    return false;
  }
  if (
    filter.some &&
    filter.some.length > 0 &&
    !filter.some.some((label) => labels.includes(label))
  ) {
    return false;
  }
  return true;
}

/** Hybrid lexical + vector retrieval as ordered `{ id: source_map_id, score }[]` (RRF). */
function rankSourceMapIdsForContent(
  persistence: MemoriesPersistence,
  input: {
    namespace: string;
    content: SearchContent;
    lexicalWeight: number;
    vectorWeight: number;
    retrievalLimit: number;
    memoryIds?: string[];
  },
): Array<{ id: string; score: number }> {
  const arms: RrfArm<string>[] = [];
  if ("text" in input.content && input.lexicalWeight > 0) {
    const ranked = persistence.searchLexicalSourceMapIds({
      namespace: input.namespace,
      text: input.content.text,
      limit: input.retrievalLimit,
      memoryIds: input.memoryIds,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "lexical", ranked, weight: input.lexicalWeight });
    }
  }
  if ("vector" in input.content && input.vectorWeight > 0) {
    const ranked = persistence.searchVectorSourceMapIds({
      namespace: input.namespace,
      vector: input.content.vector,
      limit: input.retrievalLimit,
      memoryIds: input.memoryIds,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "vector", ranked, weight: input.vectorWeight });
    }
  }
  if (arms.length === 0) return [];
  return fuseRrf(arms, { maxPerArm: input.retrievalLimit });
}

function expandNeighborsWithSubSearch<NODE_LABELS extends string, EDGE_LABELS extends string>(
  persistence: MemoriesPersistence,
  input: {
    namespace: string;
    rootMemoryKey: string;
    content: SearchContent;
    lexicalWeight: number;
    vectorWeight: number;
    minScore: number;
    neighborFilters: NeighborFilter<EDGE_LABELS, NODE_LABELS> | undefined;
    maxNeighbors: number | undefined;
  },
): SearchNeighborHit<NODE_LABELS, EDGE_LABELS>[] {
  const graphNeighbors = persistence.listNeighborsForMemory<EDGE_LABELS, NODE_LABELS>({
    namespace: input.namespace,
    key: input.rootMemoryKey,
    filters: input.neighborFilters,
  });

  const byMemoryId = new Map<string, HydratedNeighbor<EDGE_LABELS, NODE_LABELS>>();
  for (const n of graphNeighbors) {
    if (!byMemoryId.has(n._id)) {
      byMemoryId.set(n._id, n);
    }
  }

  const memoryIds = [...byMemoryId.keys()];
  if (memoryIds.length === 0) return [];
  if (input.maxNeighbors !== undefined && input.maxNeighbors === 0) return [];

  const capForRetrieval =
    input.maxNeighbors !== undefined && input.maxNeighbors >= 0
      ? input.maxNeighbors
      : Math.max(memoryIds.length, 10);
  const neighborRetrievalLimit = Math.max(capForRetrieval * 5, 25);

  const fused = rankSourceMapIdsForContent(persistence, {
    namespace: input.namespace,
    content: input.content,
    lexicalWeight: input.lexicalWeight,
    vectorWeight: input.vectorWeight,
    retrievalLimit: neighborRetrievalLimit,
    memoryIds,
  });

  if (fused.length === 0) return [];

  const hydrated = persistence.hydrateSourceMapHits<NODE_LABELS>(fused.map((r) => r.id));
  const hydratedById = new Map(hydrated.map((h) => [h._id, h]));

  const seenMemory = new Set<string>();
  const out: SearchNeighborHit<NODE_LABELS, EDGE_LABELS>[] = [];

  for (const result of fused) {
    if (result.score < input.minScore) continue;
    const hit = hydratedById.get(result.id);
    if (!hit) continue;
    const memId = hit.memory_id;
    if (seenMemory.has(memId)) continue;
    seenMemory.add(memId);

    const base = byMemoryId.get(memId);
    if (!base) continue;

    out.push({
      ...base,
      neighborScore: result.score,
      matchedSourceMapId: result.id,
    });
    if (
      input.maxNeighbors !== undefined &&
      input.maxNeighbors >= 0 &&
      out.length >= input.maxNeighbors
    ) {
      break;
    }
  }

  return out;
}

export function search<NODE_LABELS extends string = string, EDGE_LABELS extends string = string>(
  ctx: MutationCtx,
  params: SearchParams<NODE_LABELS, EDGE_LABELS>,
): SearchHit<NODE_LABELS, EDGE_LABELS>[] {
  const t0 = performance.now();
  const { persistence } = ctx;
  const topK = params.options?.topK ?? 10;
  if (topK <= 0) return [];

  const retrievalLimit = Math.max(topK * 5, 25);
  const lexicalWeight = params.options?.arms?.lexical ?? 1;
  const vectorWeight = params.options?.arms?.vector ?? 1;

  const fused = rankSourceMapIdsForContent(persistence, {
    namespace: params.namespace,
    content: params.content,
    lexicalWeight,
    vectorWeight,
    retrievalLimit,
  });
  if (fused.length === 0) return [];
  const hydrated = persistence.hydrateSourceMapHits<NODE_LABELS>(fused.map((result) => result.id));
  const hydratedById = new Map(hydrated.map((hit) => [hit._id, hit]));
  const minScore = params.options?.minScore ?? Number.NEGATIVE_INFINITY;

  const rootHits = fused
    .flatMap((result) => {
      const hit = hydratedById.get(result.id);
      if (!hit) return [];
      if (result.score < minScore) return [];
      if (!matchesLabelFilter(hit.labels, params.options?.labels)) return [];
      return [
        {
          ...hit,
          score: result.score,
        },
      ];
    })
    .slice(0, topK);

  const neighborOpt = params.options?.neighbors;
  if (neighborOpt === undefined || neighborOpt === false) {
    logger.info({
      phase: "memories.search",
      durationMs: elapsedMs(t0),
      namespace: params.namespace,
      hitCount: rootHits.length,
      topK,
      neighbors: false,
      vectorDim:
        "vector" in params.content && params.content.vector.length > 0
          ? params.content.vector.length
          : undefined,
    });
    return rootHits;
  }

  const neighborFilters: NeighborFilter<EDGE_LABELS, NODE_LABELS> | undefined =
    neighborOpt === true ? undefined : neighborOpt;
  const maxNeighbors = params.options?.maxNeighbors;

  const withNeighbors = rootHits.map((hit) => ({
    ...hit,
    neighbors: expandNeighborsWithSubSearch<NODE_LABELS, EDGE_LABELS>(persistence, {
      namespace: hit.memory.namespace,
      rootMemoryKey: hit.memory.key,
      content: params.content,
      lexicalWeight,
      vectorWeight,
      minScore,
      neighborFilters,
      maxNeighbors,
    }),
  }));
  logger.info({
    phase: "memories.search",
    durationMs: elapsedMs(t0),
    namespace: params.namespace,
    hitCount: withNeighbors.length,
    topK,
    neighbors: true,
    vectorDim:
      "vector" in params.content && params.content.vector.length > 0
        ? params.content.vector.length
        : undefined,
  });
  return withNeighbors;
}
