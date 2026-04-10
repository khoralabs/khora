import type { EdgePreviewPayload, MemoriesVisualizationRuntimeCtx } from "../persistence/types";

export type { EdgePreviewPayload } from "../persistence/types";

/**
 * Loads ontology labels + JSON properties for one edge, scoped to a namespace.
 */
export function loadEdgePreview(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
  edgeId: string,
): EdgePreviewPayload | null {
  return ctx.persistence.loadEdgePreview(namespace, edgeId);
}
