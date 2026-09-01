import type { InboxDelivery } from "../../core";
import {
  type ColonnadePlacementStore,
  type ColonnadeTursoServerlessBackendStrategy,
  createInMemoryPlacementStore,
  createResolveCellInboxDelivery,
  decodeCellId,
  principalHomeCellId,
} from "../../core";
import type { OutboxPayloadCodec } from "../../crypto";
import type { CatalogPersistence, CellPersistence, ResolveCell } from "../core";
import { defaultNoopCatalogPersistence, ShardingCatalogPersistence } from "../core";
import { createTursoClients, type TursoClients } from "./client";
import type { TursoUrlTemplateOptions } from "./resolve-url";
import { resolveTursoCredentialsFromStrategy, resolveTursoUrl } from "./resolve-url";
import { TursoCatalogPersistence } from "./turso-catalog-persistence";
import { TursoCellPersistence } from "./turso-cell-persistence";

export type TursoColonnadeClusterEncryptionOptions = {
  readonly outboxPayloadCodec: OutboxPayloadCodec;
};

export type TursoColonnadeClusterOptions = {
  readonly catalog?: CatalogPersistence;
  readonly catalogShards?: TursoUrlTemplateOptions & { readonly shardCount: number };
  readonly cells: TursoUrlTemplateOptions;
  readonly placement?: ColonnadePlacementStore;
  readonly encryption: TursoColonnadeClusterEncryptionOptions;
  readonly autoMigrate?: boolean;
};

export type TursoColonnadeCluster = {
  readonly catalog: CatalogPersistence;
  readonly resolveCell: ResolveCell;
  readonly inboxDelivery: InboxDelivery;
  readonly placement: ColonnadePlacementStore;
  /** Topology pin for pointer `cell_pool_count` (always `1` under placement isolation). */
  readonly cellPoolCount: number;
  assignPrincipalToCell(principalId: string): string;
  close(): Promise<void>;
};

async function openCatalogShards(
  opts: TursoColonnadeClusterOptions,
  catalogClients: TursoClients[],
): Promise<CatalogPersistence> {
  if (opts.catalog !== undefined) {
    return opts.catalog;
  }
  if (opts.catalogShards === undefined) {
    return defaultNoopCatalogPersistence();
  }
  const shards: CatalogPersistence[] = [];
  for (let i = 0; i < opts.catalogShards.shardCount; i += 1) {
    const shardCellId = `catalog-shard-${i}`;
    const credentials = resolveTursoUrl(opts.catalogShards, shardCellId);
    const db = createTursoClients(credentials);
    catalogClients.push(db);
    shards.push(
      await TursoCatalogPersistence.open(db, {
        shardIndex: i,
        autoMigrate: opts.autoMigrate,
      }),
    );
  }
  return new ShardingCatalogPersistence(shards);
}

type OpenCell = {
  readonly clients: TursoClients;
  readonly strategy: TursoCellPersistence;
};

function lazyCell(getStrategy: () => Promise<TursoCellPersistence>): CellPersistence {
  const base: CellPersistence = {
    appendOutboxRecord: (input) => getStrategy().then((s) => s.appendOutboxRecord(input)),
    enqueueInboxDelivery: (input) => getStrategy().then((s) => s.enqueueInboxDelivery(input)),
    listPendingInboxEntries: (input) => getStrategy().then((s) => s.listPendingInboxEntries(input)),
    fetchOutboxPayload: (input) => getStrategy().then((s) => s.fetchOutboxPayload(input)),
    deleteOutboxRecord: (input) => getStrategy().then((s) => s.deleteOutboxRecord(input)),
    listOutboxRecordsForPrincipal: (input) =>
      getStrategy().then((s) => s.listOutboxRecordsForPrincipal(input)),
    verifyAndDrainInboxBatch: (input) =>
      getStrategy().then((s) => s.verifyAndDrainInboxBatch(input)),
    appendWriteLogEntry: (input) => getStrategy().then((s) => s.appendWriteLogEntry(input)),
    fetchWriteLogBatch: (input) => getStrategy().then((s) => s.fetchWriteLogBatch(input)),
    ackWriteLogApplied: (input) => getStrategy().then((s) => s.ackWriteLogApplied(input)),
    discardInboxEntries: (input) => getStrategy().then((s) => s.discardInboxEntries(input)),
    purgePrincipal: (principalId) => getStrategy().then((s) => s.purgePrincipal(principalId)),
  };
  return Object.assign(base, {
    enqueueInboxDeliveriesBatch: (
      inputs: Parameters<TursoCellPersistence["enqueueInboxDeliveriesBatch"]>[0],
    ) => getStrategy().then((s) => s.enqueueInboxDeliveriesBatch(inputs)),
    appendWriteLogEntriesBatch: (
      inputs: Parameters<TursoCellPersistence["appendWriteLogEntriesBatch"]>[0],
    ) => getStrategy().then((s) => s.appendWriteLogEntriesBatch(inputs)),
  });
}

function asTursoStrategy(
  strategy: { readonly kind: string },
  cellId: string,
): ColonnadeTursoServerlessBackendStrategy {
  if (strategy.kind !== "turso-serverless") {
    throw new Error(
      `createTursoColonnadeCluster: placement for ${cellId} is kind=${strategy.kind}, expected turso-serverless`,
    );
  }
  return strategy as ColonnadeTursoServerlessBackendStrategy;
}

/**
 * Turso-backed lazy-open cell DBs (one remote database per cell via URL template).
 * Fan-out via {@link TursoColonnadeCluster.inboxDelivery}.
 */
export async function createTursoColonnadeCluster(
  opts: TursoColonnadeClusterOptions,
): Promise<TursoColonnadeCluster> {
  const cellById = new Map<string, OpenCell>();
  const cellOpenById = new Map<string, Promise<TursoCellPersistence>>();
  const catalogClients: TursoClients[] = [];

  const catalog = await openCatalogShards(opts, catalogClients);

  const cellStrategyOpts = {
    outboxPayloadCodec: opts.encryption.outboxPayloadCodec,
    autoMigrate: opts.autoMigrate,
  };

  const placement =
    opts.placement ??
    createInMemoryPlacementStore({
      defaultStrategy: {
        kind: "turso-serverless",
        url: opts.cells.urlTemplate,
        ...(opts.cells.authToken !== undefined ? { authToken: opts.cells.authToken } : {}),
        ...(opts.cells.remoteEncryptionKey !== undefined
          ? { remoteEncryptionKey: opts.cells.remoteEncryptionKey }
          : {}),
      },
    });

  async function openCell(cellId: string): Promise<TursoCellPersistence> {
    const existing = cellById.get(cellId);
    if (existing !== undefined) {
      return existing.strategy;
    }
    const id = decodeCellId(cellId);
    const placed = (await placement.getStrategy(id)) ?? (await placement.getDefaultStrategy());
    const tursoStrategy = asTursoStrategy(placed, cellId);
    const credentials = resolveTursoCredentialsFromStrategy(tursoStrategy, id);
    const clients = createTursoClients(credentials);
    const strategy = await TursoCellPersistence.open(clients, cellId, cellStrategyOpts);
    await strategy.ensureCellPoolCount(1);
    cellById.set(cellId, { clients, strategy });
    return strategy;
  }

  function resolveCell(cellId: string): CellPersistence {
    let openPromise = cellOpenById.get(cellId);
    if (openPromise === undefined) {
      openPromise = openCell(cellId);
      cellOpenById.set(cellId, openPromise);
    }
    if (!openPromise) {
      throw new Error(`createTursoColonnadeCluster: failed to open cell ${cellId}`);
    }
    return lazyCell(() => openPromise);
  }

  async function close(): Promise<void> {
    for (const open of cellById.values()) {
      await open.strategy.close();
    }
    cellById.clear();
    cellOpenById.clear();
    for (const db of catalogClients) {
      await db.read.close();
      await db.write.close();
    }
    catalogClients.length = 0;
  }

  return {
    catalog,
    resolveCell,
    inboxDelivery: createResolveCellInboxDelivery(resolveCell),
    placement,
    cellPoolCount: 1,
    assignPrincipalToCell: principalHomeCellId,
    close,
  };
}
