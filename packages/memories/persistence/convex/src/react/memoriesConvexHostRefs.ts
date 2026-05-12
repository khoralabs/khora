import type { MemoriesConvexApiSlice } from "../createConvexMemoriesPersistence.js";

/**
 * Builds {@link MemoriesConvexApiSlice} from host `api.memoriesHost*` modules so the React
 * client's `query` / `mutation` / `action` receive `api.file.func` references (required in the
 * browser). Raw `components.memories.*` child refs fail at runtime.
 *
 * @example
 * ```tsx
 * import { api } from "../convex/_generated/api";
 * import { memoriesConvexHostRefsFromApi } from "@khoralabs/memories-convex/react";
 *
 * <MemoriesPersistenceProvider client={client} componentApi={memoriesConvexHostRefsFromApi(api)} />
 * ```
 */
export function memoriesConvexHostRefsFromApi(api: unknown): MemoriesConvexApiSlice {
  const a = api as {
    memoriesHostQueries: object;
    memoriesHostMutations: object;
    memoriesHostActions: object;
  };
  return {
    queries: a.memoriesHostQueries as MemoriesConvexApiSlice["queries"],
    mutations: a.memoriesHostMutations as MemoriesConvexApiSlice["mutations"],
    actions: a.memoriesHostActions as MemoriesConvexApiSlice["actions"],
  };
}
