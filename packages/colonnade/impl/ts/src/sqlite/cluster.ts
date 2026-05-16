import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
import type { CellPersistenceStrategy, ResolveCellStrategy } from "../cell-persistence-strategy.ts";
import { cellDbFilenameStem } from "./principal-cell-id.ts";
import { SqliteCatalogPersistenceStrategy } from "./sqlite-catalog-strategy.ts";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy.ts";

export type SqliteColonnadeClusterMode =
  | { readonly kind: "pool"; readonly cellCount: number }
  | { readonly kind: "per_principal" };

export type SqliteColonnadeClusterOptions = {
  readonly catalogPath: string;
  readonly cellsDirectory: string;
  readonly mode: SqliteColonnadeClusterMode;
};

export type SqliteColonnadeCluster = {
  readonly catalog: CatalogPersistenceStrategy;
  readonly catalogDb: Database;
  readonly resolveCell: ResolveCellStrategy;
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

/**
 * SQLite-backed catalog (one file) + lazy-open cell DBs (`cellsDirectory/<stem>.sqlite`).
 * **`assignPrincipalToCell`** must be used when onboarding principals so pool round-robin / per-principal ids are persisted.
 */
export function createSqliteColonnadeCluster(opts: SqliteColonnadeClusterOptions): SqliteColonnadeCluster {
  mkdirSync(opts.cellsDirectory, { recursive: true });
  const catalogDb = new Database(opts.catalogPath, { create: true });
  const catalogStrategy = new SqliteCatalogPersistenceStrategy(catalogDb);

  const cellDbById = new Map<string, Database>();
  const cellStrategyById = new Map<string, SqliteCellPersistenceStrategy>();

  function resolveCell(cellId: string): CellPersistenceStrategy {
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
      return catalogStrategy.assignPrincipalToCellPool(principalId, opts.mode.cellCount);
    }
    return catalogStrategy.assignPrincipalToCellDedicated(principalId);
  }

  function close(): void {
    catalogDb.close();
    for (const db of cellDbById.values()) {
      db.close();
    }
    cellDbById.clear();
    cellStrategyById.clear();
  }

  return {
    catalog: catalogStrategy,
    catalogDb,
    resolveCell,
    assignPrincipalToCell,
    close,
  };
}
