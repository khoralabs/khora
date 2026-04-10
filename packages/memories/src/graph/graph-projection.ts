import type {
  GraphEdgeLink,
  GraphMemoryEmbedding,
  MemoriesVisualizationRuntimeCtx,
} from "../persistence/types";

export type { GraphEdgeLink, GraphMemoryEmbedding } from "../persistence/types";

/**
 * Undirected edge list for a namespace: structural relatedness between memories.
 */
export function loadGraphEdgesForNamespace(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
): GraphEdgeLink[] {
  return ctx.persistence.loadGraphEdgesForNamespace(namespace);
}

/** Ontology node labels per memory key in a namespace (stable order). */
export function loadNodeLabelsForNamespace(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
): Map<string, string[]> {
  return ctx.persistence.loadNodeLabelsForNamespace(namespace);
}

/**
 * Mean-pooled embedding per memory (only memories with at least one vector row).
 * If a memory has vectors of mixed dimensions, only the first dimension seen is kept for that memory
 * (remaining chunks skipped with a debug note in code path — rare).
 */
export function loadMeanEmbeddingsForNamespace(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
): GraphMemoryEmbedding[] {
  return ctx.persistence.loadMeanEmbeddingsForNamespace(namespace);
}
