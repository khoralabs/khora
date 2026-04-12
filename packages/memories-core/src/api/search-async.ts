import { fuseRrf, type RrfArm } from "@cfd/reciprocal-rank-fusion";
import { logger } from "../logger.js";
import type { HydratedNeighbor, NeighborFilter } from "../models/neighbor-search-types";
import type { MemoriesPersistenceAsync } from "../persistence/async-types";
import type { MemoriesBackendCapabilities, SearchNamespaceScope } from "../persistence/types";
import { resolveMemoriesBackendCapabilities } from "../persistence/types";
import { elapsedMs } from "../timing.js";
import type { MutationCtxAsync } from "./merge-memory-async";
import {
  normalizeSearchScopeFromParams,
  type SearchContent,
  type SearchHit,
  type SearchNeighborHit,
  type SearchParams,
} from "./search";

export type {
  NeighborSearchOption,
  SearchContent,
  SearchHit,
  SearchNeighborHit,
  SearchParams,
} from "./search";

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

function scopeSingleNamespace(namespace: string): SearchNamespaceScope {
  return { kind: "union", namespaces: [namespace] };
}

function warnVectorNoCandidates(namespace: string, vectorDim: number): void {
  const msg =
    "Vector search returned no candidates (embedding dimension may not match stored vectors, vector index missing or empty for this namespace, or no indexed content).";
  logger.warn({
    phase: "memories.search.vector",
    msg,
    namespace,
    vectorDim,
  });
  console.warn(`[memories] ${msg} namespace=${namespace} vectorDim=${vectorDim}`);
}

async function rankSourceMapIdsForContentAsync(
  persistence: MemoriesPersistenceAsync,
  caps: MemoriesBackendCapabilities,
  input: {
    scope: SearchNamespaceScope;
    logNamespace: string;
    content: SearchContent;
    lexicalWeight: number;
    vectorWeight: number;
    retrievalLimit: number;
    memoryIds?: string[];
  },
): Promise<Array<{ id: string; score: number }>> {
  const { scope } = input;

  if (scope.kind === "union" && scope.namespaces.length > 1 && !caps.multiNamespaceSearch) {
    const arms: RrfArm<string>[] = [];
    for (const ns of scope.namespaces) {
      const subScope = scopeSingleNamespace(ns);
      if (caps.lexicalSearch && "text" in input.content && input.lexicalWeight > 0) {
        const ranked = await persistence.searchLexicalSourceMapIds({
          scope: subScope,
          text: input.content.text,
          limit: input.retrievalLimit,
          memoryIds: input.memoryIds,
        });
        if (ranked.length > 0) {
          arms.push({ armId: `lexical:${ns}`, ranked, weight: input.lexicalWeight });
        }
      }
      if (caps.vectorSearch && "vector" in input.content && input.vectorWeight > 0) {
        const ranked = await persistence.searchVectorSourceMapIds({
          scope: subScope,
          vector: input.content.vector,
          limit: input.retrievalLimit,
          memoryIds: input.memoryIds,
        });
        if (ranked.length > 0) {
          arms.push({ armId: `vector:${ns}`, ranked, weight: input.vectorWeight });
        } else {
          warnVectorNoCandidates(ns, input.content.vector.length);
        }
      }
    }
    if (arms.length === 0) return [];
    return fuseRrf(arms, { maxPerArm: input.retrievalLimit });
  }

  const arms: RrfArm<string>[] = [];
  if (caps.lexicalSearch && "text" in input.content && input.lexicalWeight > 0) {
    const ranked = await persistence.searchLexicalSourceMapIds({
      scope,
      text: input.content.text,
      limit: input.retrievalLimit,
      memoryIds: input.memoryIds,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "lexical", ranked, weight: input.lexicalWeight });
    }
  }
  if (caps.vectorSearch && "vector" in input.content && input.vectorWeight > 0) {
    const ranked = await persistence.searchVectorSourceMapIds({
      scope,
      vector: input.content.vector,
      limit: input.retrievalLimit,
      memoryIds: input.memoryIds,
    });
    if (ranked.length > 0) {
      arms.push({ armId: "vector", ranked, weight: input.vectorWeight });
    } else {
      warnVectorNoCandidates(input.logNamespace, input.content.vector.length);
    }
  }
  if (arms.length === 0) return [];
  return fuseRrf(arms, { maxPerArm: input.retrievalLimit });
}

async function expandNeighborsWithSubSearchAsync<
  NODE_LABELS extends string,
  EDGE_LABELS extends string,
>(
  persistence: MemoriesPersistenceAsync,
  caps: MemoriesBackendCapabilities,
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
): Promise<SearchNeighborHit<NODE_LABELS, EDGE_LABELS>[]> {
  if (!caps.neighborIndex) return [];
  const graphNeighbors = await persistence.listNeighborsForMemory<EDGE_LABELS, NODE_LABELS>({
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

  const fused = await rankSourceMapIdsForContentAsync(persistence, caps, {
    scope: scopeSingleNamespace(input.namespace),
    logNamespace: input.namespace,
    content: input.content,
    lexicalWeight: input.lexicalWeight,
    vectorWeight: input.vectorWeight,
    retrievalLimit: neighborRetrievalLimit,
    memoryIds,
  });

  if (fused.length === 0) return [];

  const hydrated = await persistence.hydrateSourceMapHits<NODE_LABELS>(fused.map((r) => r.id));
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

export async function searchAsync<
  NODE_LABELS extends string = string,
  EDGE_LABELS extends string = string,
>(
  ctx: MutationCtxAsync,
  params: SearchParams<NODE_LABELS, EDGE_LABELS>,
): Promise<SearchHit<NODE_LABELS, EDGE_LABELS>[]> {
  const t0 = performance.now();
  const { persistence } = ctx;
  const caps = resolveMemoriesBackendCapabilities(persistence);
  const topK = params.options?.topK ?? 10;
  if (topK <= 0) return [];

  const hasText = "text" in params.content;
  const hasVector = "vector" in params.content;
  if (!caps.lexicalSearch && !caps.vectorSearch) {
    return [];
  }
  if (hasVector && !hasText && !caps.vectorSearch) {
    return [];
  }
  if (hasText && !hasVector && !caps.lexicalSearch) {
    return [];
  }

  const { scope, additionalNamespaceCount, unscoped } = normalizeSearchScopeFromParams(
    params,
    caps,
  );

  const retrievalLimit = Math.max(topK * 5, 25);
  const lexicalWeight = params.options?.arms?.lexical ?? 1;
  const vectorWeight = params.options?.arms?.vector ?? 1;

  const fused = await rankSourceMapIdsForContentAsync(persistence, caps, {
    scope,
    logNamespace: params.namespace,
    content: params.content,
    lexicalWeight,
    vectorWeight,
    retrievalLimit,
  });
  if (fused.length === 0) return [];
  const hydrated = await persistence.hydrateSourceMapHits<NODE_LABELS>(
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

  const neighborOpt = !caps.neighborIndex ? false : params.options?.neighbors;
  if (neighborOpt === undefined || neighborOpt === false) {
    logger.info({
      phase: "memories.search",
      durationMs: elapsedMs(t0),
      namespace: params.namespace,
      additionalNamespaceCount,
      unscoped,
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

  const withNeighbors = await Promise.all(
    rootHits.map(async (hit) => ({
      ...hit,
      neighbors: await expandNeighborsWithSubSearchAsync<NODE_LABELS, EDGE_LABELS>(
        persistence,
        caps,
        {
          namespace: hit.memory.namespace,
          rootMemoryKey: hit.memory.key,
          content: params.content,
          lexicalWeight,
          vectorWeight,
          minScore,
          neighborFilters,
          maxNeighbors,
        },
      ),
    })),
  );
  logger.info({
    phase: "memories.search",
    durationMs: elapsedMs(t0),
    namespace: params.namespace,
    additionalNamespaceCount,
    unscoped,
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
