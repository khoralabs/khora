import type { Database } from "bun:sqlite";

export type SqliteMaintenanceOptions = {
  /** Interval between `PRAGMA wal_checkpoint(TRUNCATE)` calls. Default 60_000 ms. Set ≤0 to disable. */
  walCheckpointIntervalMs?: number;
  /** Interval between `ANALYZE` calls (refresh planner stats). Default 6h. Set ≤0 to disable. */
  analyzeIntervalMs?: number;
  /** Logger sink; defaults to `console`. */
  logger?: Pick<Console, "warn" | "debug">;
};

export type SqliteMaintenanceHandle = {
  /** Clear all timers. Idempotent. */
  stop(): void;
  /** Force one pass of every enabled task (useful for tests). */
  runNow(): void;
};

const DEFAULT_WAL_CHECKPOINT_INTERVAL_MS = 60_000;
const DEFAULT_ANALYZE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Run periodic SQLite maintenance against a writer-owned `Database`:
 *
 * - `PRAGMA wal_checkpoint(TRUNCATE)` bounds the WAL size even when a long-lived
 *   read transaction would otherwise block the autocheckpoint. TRUNCATE returns
 *   the WAL file to zero bytes after a successful checkpoint, reclaiming disk.
 * - `ANALYZE` refreshes `sqlite_stat1`/`sqlite_stat4` so the query planner uses
 *   current cardinality estimates as the dataset grows.
 *
 * Both tasks are best-effort. Failures are logged and swallowed so a transient
 * lock (e.g. a writer mid-transaction) never crashes the host. Timers are
 * `unref()`'d so they don't keep the event loop alive during shutdown; the
 * returned handle lets callers stop them deterministically (e.g. tests).
 */
export function startSqliteMaintenance(
  db: Database,
  opts: SqliteMaintenanceOptions = {},
): SqliteMaintenanceHandle {
  const log = opts.logger ?? console;
  const walMs = opts.walCheckpointIntervalMs ?? DEFAULT_WAL_CHECKPOINT_INTERVAL_MS;
  const anaMs = opts.analyzeIntervalMs ?? DEFAULT_ANALYZE_INTERVAL_MS;

  const timers: NodeJS.Timeout[] = [];

  const checkpoint = () => {
    try {
      db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (e) {
      log.warn(`[atrium-host] wal_checkpoint failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const analyze = () => {
    try {
      db.run("ANALYZE;");
    } catch (e) {
      log.warn(`[atrium-host] ANALYZE failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (walMs > 0) {
    const t = setInterval(checkpoint, walMs);
    t.unref?.();
    timers.push(t);
  }
  if (anaMs > 0) {
    const t = setInterval(analyze, anaMs);
    t.unref?.();
    timers.push(t);
  }

  return {
    stop() {
      for (const t of timers) clearInterval(t);
      timers.length = 0;
    },
    runNow() {
      if (walMs > 0) checkpoint();
      if (anaMs > 0) analyze();
    },
  };
}
