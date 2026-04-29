import type { MemoriesConvexApiSlice } from "@cfd/memories-convex";

/**
 * Component API slice for `mergeMemory` atomic overload and lexical store wiring.
 * Cast from `memoriesConvexHostRefsFromApi(api)` (browser) or `components.memories` (server).
 */
export function memoriesApiSlice(memories: unknown): MemoriesConvexApiSlice {
  return memories as MemoriesConvexApiSlice;
}
