import type {
  HydratedNeighbor,
  HydratedSourceMapHit,
  NeighborFilter,
} from "../models/neighbor-search-types";
import type { MemoriesBackendCapabilities, MemoriesPersistence } from "./types";

type PromisifyMethodMap<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K];
};

/** Sync methods whose generics are lost if naively promisified; declared explicitly below. */
type MemoriesPersistenceAsyncCore = Omit<
  MemoriesPersistence,
  "withTransaction" | "capabilities" | "hydrateSourceMapHits" | "listNeighborsForMemory"
>;

/**
 * Async / remote-friendly persistence: every method returns a `Promise`, and
 * `withTransaction` accepts an async callback.
 *
 * See [PERSISTENCE_IMPLEMENTORS.md](../PERSISTENCE_IMPLEMENTORS.md).
 */
export type MemoriesPersistenceAsync = PromisifyMethodMap<MemoriesPersistenceAsyncCore> & {
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  capabilities?: MemoriesBackendCapabilities;
  hydrateSourceMapHits<NODE_LABEL extends string = string>(
    sourceMapIds: readonly string[],
  ): Promise<HydratedSourceMapHit<NODE_LABEL>[]>;
  listNeighborsForMemory<
    EDGE_LABEL extends string = string,
    NODE_LABEL extends string = string,
  >(input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  }): Promise<HydratedNeighbor<EDGE_LABEL, NODE_LABEL>[]>;
};
