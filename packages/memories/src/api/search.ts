import { fuseRrf, type RrfArm } from "../../../reciprocal-rank-fusion/index.ts";
import type { Edge, Memory, SourceMap } from "../db/schema";
import type { DbCtx, HydratedNeighbor, NeighborFilter } from "../models";
import {
  hydrateSourceMapHits,
  listNeighborsForMemory,
  searchLexicalSourceMapIds,
  searchVectorSourceMapIds,
} from "../models";
import type { MutationCtx } from "./merge-memory";

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
    neighbors?: NeighborFilter<EDGE_LABELS>;
    arms?: {
      vector?: number;
      lexical?: number;
    };
  };
}

export interface SearchHit<NODE_LABELS extends string = string, EDGE_LABELS extends string = string>
  extends SourceMap {
  score: number;
  memory: Memory;
  labels: NODE_LABELS[];
  neighbors?: Array<Memory & { labels: EDGE_LABELS[]; edge: Edge & { label: EDGE_LABELS } }>;
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

export function search<NODE_LABELS extends string = string, EDGE_LABELS extends string = string>(
  ctx: MutationCtx,
  params: SearchParams<NODE_LABELS, EDGE_LABELS>,
): SearchHit<NODE_LABELS, EDGE_LABELS>[] {
  const d: DbCtx = { db: ctx.db, now: Date.now() };
  const topK = params.options?.topK ?? 10;
  if (topK <= 0) return [];

  const retrievalLimit = Math.max(topK * 5, 25);
  const arms: RrfArm<string>[] = [];
  const lexicalWeight = params.options?.arms?.lexical ?? 1;
  const vectorWeight = params.options?.arms?.vector ?? 1;

  if ("text" in params.content && lexicalWeight > 0) {
    const ranked = searchLexicalSourceMapIds(d, {
      namespace: params.namespace,
      text: params.content.text,
      limit: retrievalLimit,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "lexical", ranked, weight: lexicalWeight });
    }
  }

  if ("vector" in params.content && vectorWeight > 0) {
    const ranked = searchVectorSourceMapIds(d, {
      namespace: params.namespace,
      vector: params.content.vector,
      limit: retrievalLimit,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "vector", ranked, weight: vectorWeight });
    }
  }

  if (arms.length === 0) return [];

  const fused = fuseRrf(arms, { maxPerArm: retrievalLimit });
  const hydrated = hydrateSourceMapHits<NODE_LABELS>(
    d,
    fused.map((result) => result.id),
  );
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

  if (!params.options?.neighbors) {
    return rootHits;
  }

  const neighborsByMemoryId = new Map<string, HydratedNeighbor<EDGE_LABELS>[]>();
  return rootHits.map((hit) => {
    let neighbors = neighborsByMemoryId.get(hit.memory._id);
    if (!neighbors) {
      neighbors = listNeighborsForMemory<EDGE_LABELS>(d, {
        namespace: hit.memory.namespace,
        key: hit.memory.key,
        filters: params.options?.neighbors,
      });
      neighborsByMemoryId.set(hit.memory._id, neighbors);
    }
    return {
      ...hit,
      neighbors,
    };
  });
}
