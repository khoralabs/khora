export type {
  MemoriesPersistenceAsync,
  TypedMergeParamsAsync as TypedMergeParams,
  TypedSearchHitAsync as TypedSearchHit,
  TypedSearchParamsAsync as TypedSearchParams,
} from "@cfd/memories-core";
export {
  deleteMemoryAsync as deleteMemory,
  MemoriesClientAsync as MemoriesClient,
  searchAsync as search,
} from "@cfd/memories-core";
export { api } from "./component/_generated/api.js";
export { CONVEX_VECTOR_DIMENSIONS } from "./component/lib/vectorConfig.js";
export { createConvexLexicalTextStore } from "./convexLexicalTextStore.js";
export { convexReactClientToMemoriesClient } from "./convexReactClientBridge.js";
export {
  type ConvexMemoriesClient,
  createConvexMemoriesPersistence,
  type MemoriesConvexApiSlice,
} from "./createConvexMemoriesPersistence";
export {
  type ConvexMemoriesPersistenceFromHostCtx,
  convexMemoriesClientFromHostBridge,
  convexMemoriesClientFromHostBridgeQueryOnly,
  createConvexMemoriesPersistenceFromHostBridge,
  createMemoriesPersistence,
  type HostComponentBridge,
  hostComponentBridgeFromActionCtx,
  hostComponentBridgeFromCtx,
  hostComponentBridgeFromMutationCtx,
  hostComponentBridgeFromQueryCtx,
} from "./hostComponentBridge.js";
export { type MergeMemoryConvexAtomicCtx, mergeMemory } from "./merge-memory-convex.js";
