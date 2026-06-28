import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { OutboxPayloadCodec } from "@khoralabs/colonnade-crypto";
import type {
  CatalogPersistenceStrategy,
  CellPersistenceStrategy,
  ColonnadeClusterMode,
  ResolveCellStrategy,
} from "@khoralabs/colonnade-persistence";
import {
  cellDbFilenameStem,
  defaultNoopCatalogPersistenceStrategy,
  derivePoolHomeCell,
  perPrincipalCellId,
} from "@khoralabs/colonnade-persistence";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";
import { ensureCellPoolManifest } from "./cell-pool-manifest";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy";
import { LazyWorkerBackedCellStrategy } from "./worker-backed-cell-strategy";

export type SqliteColonnadeClusterMode = ColonnadeClusterMode;

export type SqliteColonnadeClusterEncryptionOptions = {
  readonly sqlCipherKey: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  /** Hex-encoded 32-byte outbox key for worker init. */
  readonly outboxKeyHex: string;
};

export type SqliteColonnadeClusterOptions = {
  /** Colonnade publication replication catalog; defaults to noop when omitted. */
  readonly catalog?: CatalogPersistenceStrategy;
  readonly cellsDirectory: string;
  readonly mode: SqliteColonnadeClusterMode;
  /** One Bun **`Worker`** per opened cell (SQLite runs off the main thread). */
  readonly useCellWorkers?: boolean;
  readonly encryption: SqliteColonnadeClusterEncryptionOptions;
};

export type SqliteColonnadeCluster = {
  readonly catalog: CatalogPersistenceStrategy;
  readonly resolveCell: ResolveCellStrategy;
  /** Pool mode: fixed N from startup; undefined in per-principal mode. */
  readonly cellPoolCount: number | undefined;
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

  if (opts.mode.kind === "pool") {
    ensureCellPoolManifest(opts.cellsDirectory, opts.mode.cellCount);
  }

  const cellDbById = new Map<string, import("bun:sqlite").Database>();
  const cellStrategyById = new Map<string, SqliteCellPersistenceStrategy>();
  const lazyWorkersById = new Map<string, LazyWorkerBackedCellStrategy>();

  const cellStrategyOpts = {
    outboxPayloadCodec: opts.encryption.outboxPayloadCodec,
  };

  function resolveCell(cellId: string): CellPersistenceStrategy {
    if (opts.useCellWorkers === true) {
      let w = lazyWorkersById.get(cellId);
      if (w === undefined) {
        const stem = cellDbFilenameStem(cellId);
        const path = join(opts.cellsDirectory, `${stem}.sqlite`);
        w = new LazyWorkerBackedCellStrategy(cellId, path, {
          sqlCipherKey: opts.encryption.sqlCipherKey,
          outboxKeyHex: opts.encryption.outboxKeyHex,
        });
        lazyWorkersById.set(cellId, w);
      }
      return w;
    }

    let db = cellDbById.get(cellId);
    if (db === undefined) {
      const stem = cellDbFilenameStem(cellId);
      const path = join(opts.cellsDirectory, `${stem}.sqlite`);
      db = openEncryptedDatabaseSync(path, { create: true }, opts.encryption.sqlCipherKey);
      cellDbById.set(cellId, db);
      cellStrategyById.set(cellId, new SqliteCellPersistenceStrategy(db, cellId, cellStrategyOpts));
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
    cellPoolCount: opts.mode.kind === "pool" ? opts.mode.cellCount : undefined,
    assignPrincipalToCell,
    close,
  };
}
