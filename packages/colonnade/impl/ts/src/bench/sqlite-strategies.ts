import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
import type { CellPersistenceStrategy, ResolveCellStrategy } from "../cell-persistence-strategy.ts";
import { cellDbFilenameStem } from "../sqlite/principal-cell-id.ts";
import { SqliteCatalogPersistenceStrategy } from "../sqlite/sqlite-catalog-strategy.ts";
import { SqliteCellPersistenceStrategy } from "../sqlite/sqlite-cell-strategy.ts";
import { LazyWorkerBackedCellStrategy } from "../sqlite/worker-backed-cell-strategy.ts";

export type SqliteBenchmarkStrategiesOptions = {
  /** Bun **`Worker`** per cell (SQLite off main thread); meaningful with **`--concurrency`** > 1. */
  readonly useCellWorkers?: boolean;
};

type SqliteBenchBundle = {
  readonly root: string;
  readonly catalogDb: Database;
  readonly catalog: CatalogPersistenceStrategy;
  readonly cellsDir: string;
  cellDatabases: Database[];
  lazyWorkers: LazyWorkerBackedCellStrategy[];
};

function openSqliteBenchBundle(): SqliteBenchBundle {
  const root = mkdtempSync(join(tmpdir(), "colonnade-bench-sqlite-"));
  const cellsDir = join(root, "cells");
  mkdirSync(cellsDir, { recursive: true });
  const catalogDb = new Database(join(root, "catalog.sqlite"), { create: true });
  const catalog = new SqliteCatalogPersistenceStrategy(catalogDb);
  return { root, catalogDb, catalog, cellsDir, cellDatabases: [], lazyWorkers: [] };
}

function closeSqliteBenchBundle(b: SqliteBenchBundle): void {
  for (const w of b.lazyWorkers) {
    w.terminate();
  }
  b.lazyWorkers.length = 0;
  b.catalogDb.close();
  for (const db of b.cellDatabases) {
    db.close();
  }
  rmSync(b.root, { recursive: true, force: true });
}

/**
 * One catalog file + one cell DB per bench cell id under a temp directory (cleaned in **`teardown`**).
 */
export function createSqliteBenchmarkStrategies(opts: SqliteBenchmarkStrategiesOptions = {}) {
  const useCellWorkers = opts.useCellWorkers === true;
  let bundle: SqliteBenchBundle | undefined;

  function ensureBundle(): SqliteBenchBundle {
    if (bundle === undefined) {
      bundle = openSqliteBenchBundle();
    }
    return bundle;
  }

  return {
    createCatalog: () => ensureBundle().catalog,
    createResolveCell: (cellIds: readonly string[]) => {
      const b = ensureBundle();
      const map = new Map<string, CellPersistenceStrategy>();
      for (const id of cellIds) {
        const path = join(b.cellsDir, `${cellDbFilenameStem(id)}.sqlite`);
        if (useCellWorkers) {
          const w = new LazyWorkerBackedCellStrategy(id, path);
          b.lazyWorkers.push(w);
          map.set(id, w);
        } else {
          const db = new Database(path, { create: true });
          b.cellDatabases.push(db);
          map.set(id, new SqliteCellPersistenceStrategy(db, id));
        }
      }
      return ((cellId: string) => {
        const s = map.get(cellId);
        if (s === undefined) {
          throw new Error(`BenchmarkStrategies(sqlite): unknown cell id ${cellId}`);
        }
        return s;
      }) as ResolveCellStrategy;
    },
    teardown: () => {
      if (bundle === undefined) return;
      closeSqliteBenchBundle(bundle);
      bundle = undefined;
    },
  };
}
