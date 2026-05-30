import type { Database } from "bun:sqlite";
import { inboxStagingToBlob, writeOpToBlob } from "./staging-binary";
import { inboxStagingFromJson, writeOpFromJson } from "./staging-json";

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { x: number } | null | undefined;
  return row != null;
}

function columnType(db: Database, table: string, column: string): string | undefined {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
  const col = rows.find((r) => r.name === column);
  return col?.type;
}

function stagingCellFromLegacy(raw: unknown): Uint8Array {
  if (typeof raw === "string") {
    return inboxStagingToBlob(inboxStagingFromJson(raw));
  }
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
  return inboxStagingToBlob(inboxStagingFromJson(new TextDecoder().decode(u8)));
}

function writeOpFromLegacy(raw: unknown): Uint8Array {
  if (typeof raw === "string") {
    return writeOpToBlob(writeOpFromJson(raw));
  }
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
  return writeOpToBlob(writeOpFromJson(new TextDecoder().decode(u8)));
}

function migrateInboxStagingToBlob(db: Database): void {
  const rows = db
    .query(
      `SELECT inbox_entry_id, tenant_key, recipient_principal_id, staging, enqueued_at_ms, correlation_id FROM inbox`,
    )
    .all() as {
    inbox_entry_id: string;
    tenant_key: string;
    recipient_principal_id: string;
    staging: unknown;
    enqueued_at_ms: number;
    correlation_id: string;
  }[];
  db.run("DROP TABLE inbox");
  db.run(`
    CREATE TABLE inbox (
      inbox_entry_id TEXT PRIMARY KEY NOT NULL,
      tenant_key TEXT NOT NULL,
      recipient_principal_id TEXT NOT NULL,
      staging BLOB NOT NULL,
      enqueued_at_ms INTEGER NOT NULL,
      correlation_id TEXT NOT NULL
    );
  `);
  const ins = db.prepare(
    `INSERT INTO inbox(inbox_entry_id, tenant_key, recipient_principal_id, staging, enqueued_at_ms, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    ins.run(
      r.inbox_entry_id,
      r.tenant_key,
      r.recipient_principal_id,
      stagingCellFromLegacy(r.staging),
      r.enqueued_at_ms,
      r.correlation_id,
    );
  }
}

function migrateWriteLogOpToBlob(db: Database): void {
  const rows = db.query(`SELECT log_sequence, correlation_id, op FROM write_log`).all() as {
    log_sequence: number;
    correlation_id: string;
    op: unknown;
  }[];
  db.run("DROP TABLE write_log");
  db.run(`
    CREATE TABLE write_log (
      log_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      correlation_id TEXT NOT NULL,
      op BLOB NOT NULL
    );
  `);
  const ins = db.prepare(
    `INSERT INTO write_log(log_sequence, correlation_id, op) VALUES (?, ?, ?)`,
  );
  for (const r of rows) {
    ins.run(r.log_sequence, r.correlation_id, writeOpFromLegacy(r.op));
  }
}

export function ensureCellSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS outbox (
      record_key TEXT PRIMARY KEY NOT NULL,
      principal_id TEXT NOT NULL,
      tenant_key TEXT NOT NULL,
      payload BLOB NOT NULL,
      metadata TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      committed_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cell_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  if (!tableExists(db, "inbox")) {
    db.run(`
      CREATE TABLE inbox (
        inbox_entry_id TEXT PRIMARY KEY NOT NULL,
        tenant_key TEXT NOT NULL,
        recipient_principal_id TEXT NOT NULL,
        staging BLOB NOT NULL,
        enqueued_at_ms INTEGER NOT NULL,
        correlation_id TEXT NOT NULL
      );
    `);
  } else {
    const stTy = columnType(db, "inbox", "staging")?.toUpperCase() ?? "";
    if (stTy === "TEXT") {
      migrateInboxStagingToBlob(db);
    }
  }

  if (!tableExists(db, "write_log")) {
    db.run(`
      CREATE TABLE write_log (
        log_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL,
        op BLOB NOT NULL
      );
    `);
  } else {
    const opTy = columnType(db, "write_log", "op")?.toUpperCase() ?? "";
    if (opTy === "TEXT") {
      migrateWriteLogOpToBlob(db);
    }
  }
}
