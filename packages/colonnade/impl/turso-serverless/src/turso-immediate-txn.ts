import type { TursoClients } from "./client";
import { withWriteTransaction } from "./transactions";

const serializedTxnTail = new WeakMap<TursoClients, Promise<unknown>>();
const inTransaction = new WeakMap<TursoClients, { current: boolean }>();

function txnFlag(db: TursoClients): { current: boolean } {
  let flag = inTransaction.get(db);
  if (flag === undefined) {
    flag = { current: false };
    inTransaction.set(db, flag);
  }
  return flag;
}

/** Serialize overlapping write transactions on one Turso database handle. */
export function runSerializedTursoTransaction<T>(
  db: TursoClients,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = serializedTxnTail.get(db) ?? Promise.resolve();
  const out = prev.then(() => withWriteTransaction(db.write, txnFlag(db), async () => fn()));
  serializedTxnTail.set(
    db,
    out.catch(() => {}),
  );
  return out;
}
