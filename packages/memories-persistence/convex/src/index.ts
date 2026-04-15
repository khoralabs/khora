export type {
  MemoriesPersistenceAsync,
  TypedMergeParamsAsync as TypedMergeParams,
  TypedSearchHitAsync as TypedSearchHit,
  TypedSearchParamsAsync as TypedSearchParams,
} from "@cfd/memories-core";
export {
  deleteMemoryAsync as deleteMemory,
  MemoriesClientAsync as MemoriesClient,
  mergeMemoryAsync as mergeMemory,
  searchAsync as search,
} from "@cfd/memories-core";
export { api } from "./component/_generated/api.js";
export { createConvexLexicalTextStore } from "./convexLexicalTextStore.js";
export {
  type ConvexMemoriesClient,
  createConvexMemoriesPersistence,
} from "./createConvexMemoriesPersistence";
