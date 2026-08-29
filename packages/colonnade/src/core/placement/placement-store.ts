import type { ColonnadeDatabaseId, ColonnadeDatabaseListFilter } from "../database-id";
import { databaseKey, parseDatabaseKey } from "../database-key";
import type { ColonnadeBackendStrategy } from "./strategy";

/**
 * Control-plane placement lookup: default strategy + per-id overrides.
 * Independent of node data plane (sqlite registries can place turso cells, etc.).
 */
export type ColonnadePlacementStore = {
  getDefaultStrategy(): Promise<ColonnadeBackendStrategy>;
  setDefaultStrategy(strategy: ColonnadeBackendStrategy): Promise<void>;
  getStrategy(id: ColonnadeDatabaseId): Promise<ColonnadeBackendStrategy | undefined>;
  setStrategy(id: ColonnadeDatabaseId, strategy: ColonnadeBackendStrategy): Promise<void>;
  removeStrategy(id: ColonnadeDatabaseId): Promise<void>;
  listOverrides(
    filter?: ColonnadeDatabaseListFilter,
  ): Promise<Array<{ id: ColonnadeDatabaseId; strategy: ColonnadeBackendStrategy }>>;
};

/**
 * Optional sync peek for hosts that expose sync {@link ResolveCell}.
 * In-memory (and other sync-capable) stores implement this so placement overrides
 * apply on the sync open path without blocking.
 */
export type SyncColonnadePlacementStore = ColonnadePlacementStore & {
  getDefaultStrategySync(): ColonnadeBackendStrategy;
  getStrategySync(id: ColonnadeDatabaseId): ColonnadeBackendStrategy | undefined;
};

export function isSyncPlacementStore(
  store: ColonnadePlacementStore,
): store is SyncColonnadePlacementStore {
  return (
    "getDefaultStrategySync" in store &&
    typeof (store as SyncColonnadePlacementStore).getDefaultStrategySync === "function" &&
    "getStrategySync" in store &&
    typeof (store as SyncColonnadePlacementStore).getStrategySync === "function"
  );
}

export type InMemoryPlacementStoreOptions = {
  readonly defaultStrategy: ColonnadeBackendStrategy;
};

export function createInMemoryPlacementStore(
  opts: InMemoryPlacementStoreOptions,
): SyncColonnadePlacementStore {
  let defaultStrategy = opts.defaultStrategy;
  const overrides = new Map<string, ColonnadeBackendStrategy>();

  return {
    getDefaultStrategySync() {
      return defaultStrategy;
    },
    getStrategySync(id) {
      return overrides.get(databaseKey(id));
    },
    async getDefaultStrategy() {
      return defaultStrategy;
    },
    async setDefaultStrategy(strategy) {
      defaultStrategy = strategy;
    },
    async getStrategy(id) {
      return overrides.get(databaseKey(id));
    },
    async setStrategy(id, strategy) {
      overrides.set(databaseKey(id), strategy);
    },
    async removeStrategy(id) {
      overrides.delete(databaseKey(id));
    },
    async listOverrides(filter) {
      const entries: Array<{ id: ColonnadeDatabaseId; strategy: ColonnadeBackendStrategy }> = [];
      for (const [key, strategy] of overrides) {
        const id = parseDatabaseKey(key);
        if (id === undefined) continue;
        if (filter?.kind !== undefined && id.kind !== filter.kind) continue;
        entries.push({ id, strategy });
      }
      return entries;
    },
  };
}
