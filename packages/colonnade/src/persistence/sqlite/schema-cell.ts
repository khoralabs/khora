import type { Database } from "bun:sqlite";
import { CELL_INBOX_DDL, CELL_OUTBOX_META_DDL, CELL_WRITE_LOG_DDL } from "../core/schema";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { x: number } | null | undefined;
  return row != null;
}

function columnExists(db: Database, table: string, column: string): boolean {
  return (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (row) => row.name === column,
  );
}

export function ensureCellSchema(db: Database): void {
  db.run(CELL_OUTBOX_META_DDL);
  if (!tableExists(db, "inbox")) {
    db.run(CELL_INBOX_DDL);
  } else if (!columnExists(db, "inbox", "delivery_id")) {
    db.run(`ALTER TABLE inbox ADD COLUMN delivery_id TEXT`);
    db.run(`UPDATE inbox SET delivery_id = 'legacy:' || inbox_entry_id WHERE delivery_id IS NULL`);
  }
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS inbox_delivery_id_uq ON inbox(delivery_id)`);
  if (!tableExists(db, "write_log")) {
    db.run(CELL_WRITE_LOG_DDL);
  }
}
