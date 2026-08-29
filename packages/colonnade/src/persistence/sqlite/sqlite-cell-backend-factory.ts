import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  ColonnadeCellBackend,
  ColonnadeCellBackendFactory,
  ColonnadeDatabaseId,
  ColonnadeSqliteBackendStrategy,
} from "../../core";
import { encodeCellId, resolveEncodedDatabasePath } from "../../core";
import type { OutboxPayloadCodec } from "../../crypto";
import { openMaybeEncryptedDatabaseSync } from "../../crypto";
import type { CellPersistence } from "../core";
import { SqliteCellPersistence } from "./sqlite-cell-persistence";
import { LazyWorkerBackedCellPersistence } from "./worker-backed-cell-persistence";

export type SqliteCellBackendFactoryOptions = {
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  /** Hex-encoded 32-byte outbox key for worker init. */
  readonly outboxKeyHex: string;
  readonly useCellWorkers?: boolean;
};

/**
 * Opens one SQLite cell DB per `{ kind, ownerKey }` under
 * `{dataDir}/v1/{encoded}/database.db` (or worker-backed equivalent).
 */
export function createSqliteCellBackendFactory(
  opts: SqliteCellBackendFactoryOptions,
): ColonnadeCellBackendFactory {
  return {
    create(strategy): ColonnadeCellBackend {
      if (strategy.kind !== "sqlite") {
        throw new Error(`createSqliteCellBackendFactory: unexpected kind ${strategy.kind}`);
      }
      const sqliteStrategy = strategy as ColonnadeSqliteBackendStrategy;
      const cellDbById = new Map<string, import("bun:sqlite").Database>();
      const cellStrategyById = new Map<string, SqliteCellPersistence>();
      const lazyWorkersById = new Map<string, LazyWorkerBackedCellPersistence>();
      const cellStrategyOpts = { outboxPayloadCodec: opts.outboxPayloadCodec };

      function open(id: ColonnadeDatabaseId): CellPersistence {
        const cellId = encodeCellId(id);
        if (opts.useCellWorkers === true) {
          let w = lazyWorkersById.get(cellId);
          if (w === undefined) {
            const path = resolveEncodedDatabasePath(sqliteStrategy.dataDir, id);
            mkdirSync(dirname(path), { recursive: true });
            w = new LazyWorkerBackedCellPersistence(cellId, path, {
              sqlCipherKey: sqliteStrategy.sqlCipherKey,
              outboxKeyHex: opts.outboxKeyHex,
            });
            lazyWorkersById.set(cellId, w);
          }
          return w;
        }

        let db = cellDbById.get(cellId);
        if (db === undefined) {
          const path = resolveEncodedDatabasePath(sqliteStrategy.dataDir, id);
          mkdirSync(dirname(path), { recursive: true });
          db = openMaybeEncryptedDatabaseSync(path, { create: true }, sqliteStrategy.sqlCipherKey);
          cellDbById.set(cellId, db);
          cellStrategyById.set(cellId, new SqliteCellPersistence(db, cellId, cellStrategyOpts));
        }
        const persistence = cellStrategyById.get(cellId);
        if (persistence === undefined) {
          throw new Error(`sqlite cell backend: failed to open ${cellId}`);
        }
        return persistence;
      }

      return {
        strategy: sqliteStrategy,
        open,
        close() {
          for (const w of lazyWorkersById.values()) {
            w.terminate();
          }
          lazyWorkersById.clear();
          for (const db of cellDbById.values()) {
            db.close();
          }
          cellDbById.clear();
          cellStrategyById.clear();
        },
      };
    },
  };
}
