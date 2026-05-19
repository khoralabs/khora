import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
import type { CellPersistenceStrategy, ResolveCellStrategy } from "../cell-persistence-strategy.ts";
import { defaultNoopCatalogPersistenceStrategy } from "../noop-catalog-strategy.ts";
import { cellDbFilenameStem, derivePoolHomeCell, perPrincipalCellId } from "./principal-cell-id.ts";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy.ts";
import { LazyWorkerBackedCellStrategy } from "./worker-backed-cell-strategy.ts";

export type SqliteColonnadeClusterMode =
  | { readonly kind: "pool"; readonly cellCount: number }
  | { readonly kind: "per_principal" };

export type SqliteColonnadeClusterOptions = {
  /** Colonnade publication replication catalog; defaults to noop when omitted. */
  readonly catalog?: CatalogPersistenceStrategy;
  readonly cellsDirectory: string;
  readonly mode: SqliteColonnadeClusterMode;
  /** One Bun **`Worker`** per opened cell (SQLite runs off the main thread). */
  readonly useCellWorkers?: boolean;
};

export type SqliteColonnadeCluster = {
  readonly catalog: CatalogPersistenceStrategy;
  readonly resolveCell: ResolveCellStrategy;
  /** Pool mode: **`derivePoolHomeCell`**; per-principal: **`perPrincipalCellId`** (pure functions; no catalog rows). */
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

/**
 * SQLite-backed lazy-open cell DBs (`cellsDirectory/<stem>.sqlite`).
 * Catalog persistence is supplied by the caller.
 */
export function createSqliteColonnadeCluster(
  opts: SqliteColonnadeClusterOptions,
): SqliteColonnadeCluster {
  mkdirSync(opts.cellsDirectory, { recursive: true });

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
    for (const db of cellDbById.values()) {
      db.close();
    }
    cellDbById.clear();
    cellStrategyById.clear();
  }

  return {
    catalog: opts.catalog ?? defaultNoopCatalogPersistenceStrategy(),
    resolveCell,
    assignPrincipalToCell,
    close,
  };
}
