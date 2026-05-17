import type { Database } from "bun:sqlite";

/**
 * One SQLite connection cannot handle overlapping **`BEGIN`** / **`BEGIN IMMEDIATE`** from concurrent
 * async callers (e.g. bench **`Promise.all`** waves). Queue transactions per **`Database`** handle.
 */
const serializedTxnTail = new WeakMap<Database, Promise<unknown>>();

export async function runSqliteImmediateTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = await fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

/** Same as **`runSqliteImmediateTransaction`**, but serializes callers that share **`db`**. */
export function runSerializedSqliteImmediateTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  const prev = serializedTxnTail.get(db) ?? Promise.resolve();
  const out = prev.then(() => runSqliteImmediateTransaction(db, fn));
  serializedTxnTail.set(db, out.catch(() => {}));
  return out;
}
