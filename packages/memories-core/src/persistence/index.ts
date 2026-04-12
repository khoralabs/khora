export type { MemoriesPersistenceAsync } from "./async-types";
export {
  buildCanonicalMemorySearchMetaText,
  buildCanonicalMemorySearchMetaTextAsync,
  upsertMemorySearchMetaVector,
  upsertMemorySearchMetaVectorAsync,
} from "./facade.ts";
export type {
  EdgePreviewPayload,
  GraphEdgeLink,
  GraphMemoryEmbedding,
  MemoriesBackendCapabilities,
  MemoriesMutation,
  MemoriesNeighborIndex,
  MemoriesPersistence,
  MemoriesPersistenceReads,
  MemoriesRetrieval,
  MemoriesRuntimeCtx,
  MemoriesVisualization,
  MemoriesVisualizationRuntimeCtx,
  MemoryOpContext,
  SearchNamespaceScope,
} from "./types";
export {
  DEFAULT_MEMORIES_BACKEND_CAPABILITIES,
  resolveMemoriesBackendCapabilities,
} from "./types";
export { wrapSyncMemoriesPersistenceAsAsync } from "./wrap-sync-as-async.ts";
