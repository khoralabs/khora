import type { Database } from "bun:sqlite";

/** Monotonic ledger sequence persisted in the same SQLite file as OBP (restart-safe). */
export function createDurableLedgerSeq(db: Database): () => number {
  db.run(
    `CREATE TABLE IF NOT EXISTS atrium_obp_ledger_seq (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL)`,
  );
  db.run(`INSERT OR IGNORE INTO atrium_obp_ledger_seq (id, v) VALUES (1, 0)`);
  const bump = db.transaction(() => {
    const row = db.query<{ v: number }, []>(`SELECT v FROM atrium_obp_ledger_seq WHERE id = 1`).get();
    const next = (row?.v ?? 0) + 1;
    db.run(`UPDATE atrium_obp_ledger_seq SET v = ? WHERE id = 1`, [next]);
    return next;
  });
  return () => bump();
}
