import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
import type { CellPersistenceStrategy, ResolveCellStrategy } from "../cell-persistence-strategy.ts";
import { cellDbFilenameStem, derivePoolHomeCell, perPrincipalCellId } from "./principal-cell-id.ts";
import { ShardingCatalogPersistenceStrategy } from "./sharding-catalog-strategy.ts";
import { SqliteCatalogPersistenceStrategy } from "./sqlite-catalog-strategy.ts";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy.ts";
import { LazyWorkerBackedCellStrategy } from "./worker-backed-cell-strategy.ts";

export type SqliteColonnadeClusterMode =
  | { readonly kind: "pool"; readonly cellCount: number }
  | { readonly kind: "per_principal" };

export type SqliteColonnadeClusterOptions = {
  /**
   * Single-catalog mode (**`catalogShardCount === 1`**): path to the SQLite file.
   * Multi-shard mode: directory containing **`catalog-shard-{i}.sqlite`** files.
   */
  readonly catalogPath: string;
  readonly catalogShardCount?: number;
  readonly cellsDirectory: string;
  readonly mode: SqliteColonnadeClusterMode;
  /** One Bun **`Worker`** per opened cell (SQLite runs off the main thread). */
  readonly useCellWorkers?: boolean;
};

export type SqliteColonnadeCluster = {
  readonly catalog: CatalogPersistenceStrategy;
  /** Open catalog database handles (length matches **`catalogShardCount`**). */
  readonly catalogDatabases: readonly Database[];
  /** First catalog DB when present (same as **`catalogDatabases[0]`**). */
  readonly catalogDb: Database;
  readonly resolveCell: ResolveCellStrategy;
  /** Pool mode: **`derivePoolHomeCell`**; per-principal: **`perPrincipalCellId`** (pure functions; no catalog rows). */
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

function openCatalogDatabasePaths(catalogPath: string, shardCount: number): string[] {
  if (shardCount === 1) {
    return [catalogPath];
  }
  mkdirSync(catalogPath, { recursive: true });
  return Array.from({ length: shardCount }, (_, i) =>
    join(catalogPath, `catalog-shard-${i}.sqlite`),
  );
}

/**
 * SQLite-backed catalog shard(s) + lazy-open cell DBs (`cellsDirectory/<stem>.sqlite`).
 */
export function createSqliteColonnadeCluster(
  opts: SqliteColonnadeClusterOptions,
): SqliteColonnadeCluster {
  mkdirSync(opts.cellsDirectory, { recursive: true });
  const shardCount = opts.catalogShardCount ?? 1;
  const catalogPaths = openCatalogDatabasePaths(opts.catalogPath, shardCount);
  const catalogDatabases = catalogPaths.map((p) => new Database(p, { create: true }));
  const leafCatalogStrategies = catalogDatabases.map(
    (db, i) => new SqliteCatalogPersistenceStrategy(db, { shardIndex: i }),
  );
  const catalog: CatalogPersistenceStrategy =
    shardCount === 1
      ? leafCatalogStrategies[0]!
      : new ShardingCatalogPersistenceStrategy(leafCatalogStrategies);

  const cellDbById = new Map<string, Database>();
  const cellStrategyById = new Map<string, SqliteCellPersistenceStrategy>();
  const lazyWorkersById = new Map<string, LazyWorkerBackedCellStrategy>();

  function resolveCell(cellId: string): CellPersistenceStrategy {
    if (opts.useCellWorkers === true) {
      let w = lazyWorkersById.get(cellId);
      if (w === undefined) {
        const stem = cellDbFilenameStem(cellId);
        const path = join(opts.cellsDirectory, `${stem}.sqlite`);
        w = new LazyWorkerBackedCellStrategy(cellId, path);
        lazyWorkersById.set(cellId, w);
      }
      return w;
    }

    let db = cellDbById.get(cellId);
    if (db === undefined) {
      const stem = cellDbFilenameStem(cellId);
      const path = join(opts.cellsDirectory, `${stem}.sqlite`);
      db = new Database(path, { create: true });
      cellDbById.set(cellId, db);
      cellStrategyById.set(cellId, new SqliteCellPersistenceStrategy(db, cellId));
    }
    const strategy = cellStrategyById.get(cellId);
    if (strategy === undefined) {
      throw new Error(`createSqliteColonnadeCluster: failed to open cell ${cellId}`);
    }
    return strategy;
  }

  function assignPrincipalToCell(principalId: string): string {
    if (opts.mode.kind === "pool") {
      return derivePoolHomeCell(principalId, opts.mode.cellCount);
    }
    return perPrincipalCellId(principalId);
  }

  function close(): void {
    for (const w of lazyWorkersById.values()) {
      w.terminate();
    }
    lazyWorkersById.clear();
    for (const db of catalogDatabases) {
      db.close();
    }
    for (const db of cellDbById.values()) {
      db.close();
    }
    cellDbById.clear();
    cellStrategyById.clear();
  }

  const catalogDb = catalogDatabases[0];
  if (catalogDb === undefined) {
    throw new Error("createSqliteColonnadeCluster: catalogDatabases empty");
  }

  return {
    catalog,
    catalogDatabases,
    catalogDb,
    resolveCell,
    assignPrincipalToCell,
    close,
  };
}
