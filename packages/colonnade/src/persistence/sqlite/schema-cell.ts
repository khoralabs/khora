import type { Database } from "bun:sqlite";
import { CELL_INBOX_DDL, CELL_OUTBOX_META_DDL, CELL_WRITE_LOG_DDL } from "../core/schema";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { x: number } | null | undefined;
  return row != null;
}

export function ensureCellSchema(db: Database): void {
  db.run(CELL_OUTBOX_META_DDL);
  if (!tableExists(db, "inbox")) {
    db.run(CELL_INBOX_DDL);
  }
  if (!tableExists(db, "write_log")) {
    db.run(CELL_WRITE_LOG_DDL);
  }
}
