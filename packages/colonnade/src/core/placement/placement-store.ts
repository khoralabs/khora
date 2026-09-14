import type { ColonnadeDatabaseId, ColonnadeDatabaseListFilter } from "../database-id";
import { databaseKey, parseDatabaseKey } from "../database-key";
import { decodeCellId } from "../owner-key-encoder";
import type { ColonnadeBackendStrategy } from "./strategy";

export type CellRoute = {
  readonly nodeId: string;
  readonly endpoint: string;
  readonly partitionId: string;
  readonly backendKind: string;
  readonly epoch: number;
};

export type CellRouteResolver = {
  resolveMany(logicalCellIds: readonly string[]): Promise<ReadonlyMap<string, CellRoute>>;
};

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
  /** Resolve logical homes to cell-node routes when virtual partitions are configured. */
  resolveMany?(logicalCellIds: readonly string[]): Promise<ReadonlyMap<string, CellRoute>>;
  setDefaultRoutes?(routes: readonly CellRoute[]): Promise<void>;
  setPrincipalRoute?(principalId: string, route: CellRoute): Promise<void>;
  removePrincipalRoute?(principalId: string): Promise<void>;
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
  readonly defaultRoutes?: readonly CellRoute[];
  readonly principalRoutes?: Readonly<Record<string, CellRoute>>;
};

export function createInMemoryPlacementStore(
  opts: InMemoryPlacementStoreOptions,
): SyncColonnadePlacementStore {
  let defaultStrategy = opts.defaultStrategy;
  const overrides = new Map<string, ColonnadeBackendStrategy>();
  let defaultRoutes = [...(opts.defaultRoutes ?? [])];
  const principalRoutes = new Map(Object.entries(opts.principalRoutes ?? {}));

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
    async resolveMany(logicalCellIds) {
      const routes = new Map<string, CellRoute>();
      for (const logicalCellId of logicalCellIds) {
        const principalId = principalIdFromHome(logicalCellId);
        const override = principalId === undefined ? undefined : principalRoutes.get(principalId);
        const route =
          override ??
          (defaultRoutes.length === 0
            ? undefined
            : defaultRoutes[hashString(logicalCellId) % defaultRoutes.length]);
        if (route !== undefined) routes.set(logicalCellId, route);
      }
      return routes;
    },
    async setDefaultRoutes(routes) {
      defaultRoutes = [...routes];
    },
    async setPrincipalRoute(principalId, route) {
      principalRoutes.set(principalId, route);
    },
    async removePrincipalRoute(principalId) {
      principalRoutes.delete(principalId);
    },
  };
}

function principalIdFromHome(cellId: string): string | undefined {
  try {
    const id = decodeCellId(cellId);
    return id?.kind === "principal" ? id.ownerKey : undefined;
  } catch {
    return undefined;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
