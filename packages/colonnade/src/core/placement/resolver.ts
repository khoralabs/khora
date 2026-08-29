import type { CellPersistence } from "../../persistence/core/cell-persistence";
import type { ColonnadeDatabaseId } from "../database-id";
import { cacheKeyForId } from "../database-key";
import type { ColonnadeCellBackend, ColonnadeCellBackendFactory } from "./backend";
import type { ColonnadePlacementStore } from "./placement-store";
import { strategyCacheKey } from "./strategy";

export type ColonnadeCellBackendResolver = {
  /** Resolve placement and return a backend for this home (backends cached by strategy JSON). */
  resolveBackend(id: ColonnadeDatabaseId): Promise<ColonnadeCellBackend>;
  /** Open the cell for this home (sync CellPersistence facade). */
  open(id: ColonnadeDatabaseId): Promise<CellPersistence>;
  /** Sync open after placement has been resolved (uses cached backend). Prefer {@link open}. */
  openSync(id: ColonnadeDatabaseId, backend: ColonnadeCellBackend): CellPersistence;
  /** Close all backends held in the strategy cache. */
  close(): void;
};

export type CreateCellBackendResolverOptions = {
  readonly placement: ColonnadePlacementStore;
  readonly factory: ColonnadeCellBackendFactory;
  readonly backendCacheSize?: number;
};

/**
 * Placement → strategy → backend factory. Connection/open policy for fan-out bursts
 * belongs in InboxDelivery adapters, not here.
 */
export function createCellBackendResolver(
  opts: CreateCellBackendResolverOptions,
): ColonnadeCellBackendResolver {
  const max = opts.backendCacheSize ?? 32;
  const backendCache = new Map<string, ColonnadeCellBackend>();
  const backendOrder: string[] = [];

  function rememberBackend(key: string, backend: ColonnadeCellBackend): ColonnadeCellBackend {
    if (backendCache.has(key)) {
      backendCache.set(key, backend);
      return backend;
    }
    while (backendOrder.length >= max) {
      const evict = backendOrder.shift();
      if (evict === undefined) break;
      const old = backendCache.get(evict);
      backendCache.delete(evict);
      old?.close?.();
    }
    backendOrder.push(key);
    backendCache.set(key, backend);
    return backend;
  }

  async function backendForStrategy(
    strategy: Parameters<ColonnadeCellBackendFactory["create"]>[0],
  ): Promise<ColonnadeCellBackend> {
    const key = strategyCacheKey(strategy);
    const cached = backendCache.get(key);
    if (cached !== undefined) return cached;
    return rememberBackend(key, opts.factory.create(strategy));
  }

  return {
    async resolveBackend(id) {
      void cacheKeyForId(id);
      const strategy =
        (await opts.placement.getStrategy(id)) ?? (await opts.placement.getDefaultStrategy());
      return backendForStrategy(strategy);
    },
    async open(id) {
      const backend = await backendForStrategy(
        (await opts.placement.getStrategy(id)) ?? (await opts.placement.getDefaultStrategy()),
      );
      return backend.open(id);
    },
    openSync(id, backend) {
      return backend.open(id);
    },
    close() {
      for (const backend of backendCache.values()) {
        backend.close?.();
      }
      backendCache.clear();
      backendOrder.length = 0;
    },
  };
}
