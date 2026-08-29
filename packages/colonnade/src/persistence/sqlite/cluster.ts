import { mkdirSync } from "node:fs";

import type {
  ColonnadeCellBackendResolver,
  ColonnadePlacementStore,
  InboxDelivery,
} from "../../core";
import {
  createCellBackendResolver,
  createCompositeBackendFactory,
  createInMemoryPlacementStore,
  createLocalPlacementInboxDelivery,
  decodeCellId,
  encodeCellId,
  isSyncPlacementStore,
  principalHomeCellId,
  strategyCacheKey,
} from "../../core";
import type { OutboxPayloadCodec } from "../../crypto";
import type { CatalogPersistence, CellPersistence, ResolveCell } from "../core";
import { defaultNoopCatalogPersistence } from "../core";
import { createSqliteCellBackendFactory } from "./sqlite-cell-backend-factory";

export type SqliteColonnadeClusterEncryptionOptions = {
  /** When set, encrypt cell DBs with SQLCipher; omit for plaintext. */
  readonly sqlCipherKey?: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  /** Hex-encoded 32-byte outbox key for worker init. */
  readonly outboxKeyHex: string;
};

export type SqliteColonnadeClusterOptions = {
  /** Colonnade publication replication catalog; defaults to noop when omitted. */
  readonly catalog?: CatalogPersistence;
  readonly cellsDirectory: string;
  /** Override placement store (defaults to in-memory with sqlite strategy for `cellsDirectory`). */
  readonly placement?: ColonnadePlacementStore;
  /** One Bun **`Worker`** per opened cell (SQLite runs off the main thread). */
  readonly useCellWorkers?: boolean;
  readonly encryption: SqliteColonnadeClusterEncryptionOptions;
};

export type SqliteColonnadeCluster = {
  readonly catalog: CatalogPersistence;
  readonly resolveCell: ResolveCell;
  /**
   * Fan-out delivery port (local placement adapter). Publication should use this
   * rather than looping resolveCell; at scale, swap for multiplexed cell-node delivery.
   */
  readonly inboxDelivery: InboxDelivery;
  readonly placement: ColonnadePlacementStore;
  readonly resolver: ColonnadeCellBackendResolver;
  /**
   * Topology pin for pointer `cell_pool_count` (always `1` under placement isolation).
   */
  readonly cellPoolCount: number;
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

/**
 * SQLite-backed lazy-open cell DBs at `{cellsDirectory}/v1/{encoded}/database.db`.
 */
export function createSqliteColonnadeCluster(
  opts: SqliteColonnadeClusterOptions,
): SqliteColonnadeCluster {
  mkdirSync(opts.cellsDirectory, { recursive: true });
  const catalog = opts.catalog ?? defaultNoopCatalogPersistence();

  const defaultStrategy = {
    kind: "sqlite" as const,
    dataDir: opts.cellsDirectory,
    ...(opts.encryption.sqlCipherKey !== undefined
      ? { sqlCipherKey: opts.encryption.sqlCipherKey }
      : {}),
  };
  const placement = opts.placement ?? createInMemoryPlacementStore({ defaultStrategy });

  const sqliteFactory = createSqliteCellBackendFactory({
    outboxPayloadCodec: opts.encryption.outboxPayloadCodec,
    outboxKeyHex: opts.encryption.outboxKeyHex,
    useCellWorkers: opts.useCellWorkers,
  });
  const factory = createCompositeBackendFactory({ sqlite: sqliteFactory });
  const resolver = createCellBackendResolver({ placement, factory });

  const openCache = new Map<string, CellPersistence>();
  const backendByStrategyKey = new Map<string, ReturnType<typeof factory.create>>();

  function backendForStrategySync(strategy: Parameters<typeof factory.create>[0]) {
    const key = strategyCacheKey(strategy);
    const cached = backendByStrategyKey.get(key);
    if (cached !== undefined) return cached;
    const backend = factory.create(strategy);
    backendByStrategyKey.set(key, backend);
    return backend;
  }

  function strategyForIdSync(id: ReturnType<typeof decodeCellId>) {
    if (!isSyncPlacementStore(placement)) {
      throw new Error(
        "createSqliteColonnadeCluster: sync resolveCell requires a SyncColonnadePlacementStore; use inboxDelivery / resolver.open for async placement",
      );
    }
    return placement.getStrategySync(id) ?? placement.getDefaultStrategySync();
  }

  const resolveCell: ResolveCell = (cellId) => {
    const cached = openCache.get(cellId);
    if (cached !== undefined) return cached;
    const id = decodeCellId(cellId);
    const strategy = strategyForIdSync(id);
    const cell = backendForStrategySync(strategy).open(id);
    openCache.set(cellId, cell);
    return cell;
  };

  const inboxDelivery = createLocalPlacementInboxDelivery({
    resolver: {
      resolveBackend: (id) => resolver.resolveBackend(id),
      open: async (id) => {
        const cellId = encodeCellId(id);
        const cached = openCache.get(cellId);
        if (cached !== undefined) return cached;
        const cell = await resolver.open(id);
        openCache.set(cellId, cell);
        return cell;
      },
      openSync: (id, backend) => {
        const cellId = encodeCellId(id);
        const cached = openCache.get(cellId);
        if (cached !== undefined) return cached;
        const cell = backend.open(id);
        openCache.set(cellId, cell);
        return cell;
      },
      close: () => resolver.close(),
    },
    resolveOpenCell: (cellId) => {
      // Only reuse sync-resolved cells; async placement must not inherit a defaultStrategy cache.
      if (!isSyncPlacementStore(placement)) return undefined;
      return openCache.get(cellId);
    },
  });

  return {
    catalog,
    resolveCell,
    inboxDelivery,
    placement,
    resolver,
    cellPoolCount: 1,
    assignPrincipalToCell(principalId) {
      return principalHomeCellId(principalId);
    },
    close() {
      for (const backend of backendByStrategyKey.values()) {
        backend.close?.();
      }
      backendByStrategyKey.clear();
      resolver.close();
      openCache.clear();
    },
  };
}
