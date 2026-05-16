import type { Database, Statement } from "bun:sqlite";

import type { CellPersistenceStrategy } from "../cell-persistence-strategy.ts";
import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  InboxStagingPayload,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  ResolvedPayload,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
  WriteLogRecord,
  WriteOp,
} from "../colonnade-types.ts";
import { assertContentHash, randomId, sha256HexLower } from "../hash.ts";
import { ensureCellSchema } from "./schema-cell.ts";
import { inboxStagingFromBlob, inboxStagingToBlob, writeOpFromBlob, writeOpToBlob } from "./staging-binary.ts";
import { applySqlitePerfPragmas } from "./sqlite-pragmas.ts";

export class SqliteCellPersistenceStrategy implements CellPersistenceStrategy {
  private readonly db: Database;
  private readonly cellId: string;
  private readonly stmtAppendOutbox: Statement;
  private readonly stmtEnqueueInbox: Statement;
  private readonly stmtListInbox: Statement;
  private readonly stmtCountInbox: Statement;
  private readonly stmtFetchOutbox: Statement;
  private readonly stmtSelectInboxDrain: Statement;
  private readonly stmtDeleteInbox: Statement;
  private readonly stmtAppendWriteLog: Statement;
  private readonly stmtLastInsertRowid: Statement;
  private readonly stmtFetchWriteLog: Statement;
  private readonly stmtSetMeta: Statement;

  constructor(db: Database, cellId: string) {
    this.db = db;
    this.cellId = cellId;
    ensureCellSchema(db);
    applySqlitePerfPragmas(db);
    this.stmtAppendOutbox = this.db.prepare(
      `INSERT INTO outbox(record_key, principal_id, tenant_key, payload, metadata, content_hash, committed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.stmtEnqueueInbox = this.db.prepare(
      `INSERT INTO inbox(inbox_entry_id, tenant_key, recipient_principal_id, staging, enqueued_at_ms, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    this.stmtListInbox = this.db.prepare(
      `SELECT inbox_entry_id, recipient_principal_id, staging, enqueued_at_ms FROM inbox
       WHERE tenant_key = ? AND recipient_principal_id = ?
       ORDER BY enqueued_at_ms ASC
       LIMIT ? OFFSET ?`,
    );
    this.stmtCountInbox = this.db.prepare(
      `SELECT COUNT(*) AS c FROM inbox WHERE tenant_key = ? AND recipient_principal_id = ?`,
    );
    this.stmtFetchOutbox = this.db.prepare(`SELECT payload, content_hash FROM outbox WHERE record_key = ?`);
    this.stmtSelectInboxDrain = this.db.prepare(
      `SELECT recipient_principal_id, tenant_key, staging FROM inbox WHERE inbox_entry_id = ?`,
    );
    this.stmtDeleteInbox = this.db.prepare(`DELETE FROM inbox WHERE inbox_entry_id = ?`);
    this.stmtAppendWriteLog = this.db.prepare(`INSERT INTO write_log(correlation_id, op) VALUES (?, ?)`);
    this.stmtLastInsertRowid = this.db.prepare(`SELECT last_insert_rowid() AS id`);
    this.stmtFetchWriteLog = this.db.prepare(
      `SELECT log_sequence, correlation_id, op FROM write_log WHERE log_sequence > ? ORDER BY log_sequence ASC LIMIT ?`,
    );
    this.stmtSetMeta = this.db.prepare(
      `INSERT INTO cell_meta(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  }

  private assertCell(cell_id: string): void {
    if (cell_id !== this.cellId) {
      throw new Error(`SqliteCellPersistenceStrategy: cell_id mismatch (expected ${this.cellId})`);
    }
  }

  private setMeta(key: string, value: string): void {
    this.stmtSetMeta.run(key, value);
  }

  appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    this.assertCell(input.cell_id);
    const recordKey = input.record_key.trim().length > 0 ? input.record_key : randomId("ob");
    const content_hash = sha256HexLower(input.payload_bytes);
    assertContentHash(content_hash);
    const committed_at_ms = Date.now();
    this.stmtAppendOutbox.run(
      recordKey,
      input.principal_id,
      input.tenant_key,
      input.payload_bytes,
      JSON.stringify(input.metadata),
      content_hash,
      committed_at_ms,
    );
    return Promise.resolve({ record_key: recordKey, content_hash, committed_at_ms });
  }

  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput> {
    this.assertCell(input.cell_id);
    const inbox_entry_id = randomId("ib");
    const enqueued_at_ms = Date.now();
    const staging = inboxStagingToBlob(input.staging);
    this.stmtEnqueueInbox.run(
      inbox_entry_id,
      input.tenant_key,
      input.recipient_principal_id,
      staging,
      enqueued_at_ms,
      input.correlation_id,
    );
    return Promise.resolve({ inbox_entry_id });
  }

  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    this.assertCell(input.cell_id);
    const offset = parseCursor(input.cursor);
    const rows = this.stmtListInbox.all(input.tenant_key, input.principal_id, input.limit, offset) as {
      inbox_entry_id: string;
      recipient_principal_id: string;
      staging: Uint8Array | Buffer;
      enqueued_at_ms: number;
    }[];

    const total = Number((this.stmtCountInbox.get(input.tenant_key, input.principal_id) as { c: number }).c);
    const nextOffset = offset + rows.length;
    const next_cursor = nextOffset < total ? String(nextOffset) : "";

    const entries = rows.map((r) => ({
      inbox_entry_id: r.inbox_entry_id,
      recipient_principal_id: r.recipient_principal_id,
      staging: inboxStagingFromBlob(asUint8(r.staging)),
      enqueued_at_ms: r.enqueued_at_ms,
    }));

    return Promise.resolve({ entries, next_cursor });
  }

  fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    this.assertCell(input.cell_id);
    if (input.locator.cell_id !== this.cellId) {
      throw new Error("SqliteCellPersistenceStrategy: locator.cell_id mismatch");
    }
    const row = this.stmtFetchOutbox.get(input.locator.record_key) as
      | { payload: Uint8Array | Buffer; content_hash: string }
      | undefined
      | null;
    if (row == null) {
      return Promise.resolve({
        payload_bytes: new Uint8Array(),
        content_hash: ZERO_PAD_HASH,
        bytes_available: false,
      });
    }
    const payload_bytes = asUint8(row.payload);
    assertContentHash(row.content_hash);
    return Promise.resolve({
      payload_bytes,
      content_hash: row.content_hash,
      bytes_available: true,
    });
  }

  verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    this.assertCell(input.cell_id);
    const resolvedById = new Map(input.resolved_payloads.map((r) => [r.inbox_entry_id, r]));
    const drained: string[] = [];
    const failed: string[] = [];

    for (const entryId of input.inbox_entry_ids) {
      const row = this.stmtSelectInboxDrain.get(entryId) as
        | { recipient_principal_id: string; tenant_key: string; staging: Uint8Array | Buffer }
        | undefined
        | null;

      if (
        row == null ||
        row.recipient_principal_id !== input.principal_id ||
        row.tenant_key !== input.tenant_key
      ) {
        failed.push(entryId);
        continue;
      }

      const staging = inboxStagingFromBlob(asUint8(row.staging));
      const ok = verifyStaging(staging, resolvedById.get(entryId));
      if (!ok) {
        failed.push(entryId);
        continue;
      }

      this.stmtDeleteInbox.run(entryId);
      drained.push(entryId);
    }

    return Promise.resolve({ drained_entry_ids: drained, failed_entry_ids: failed });
  }

  appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    this.assertCell(input.cell_id);
    const opBlob = writeOpToBlob(input.op);
    this.stmtAppendWriteLog.run(input.correlation_id, opBlob);
    const seqRow = this.stmtLastInsertRowid.get() as { id: number };
    const log_sequence = String(seqRow.id);
    return Promise.resolve({ log_sequence });
  }

  fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    this.assertCell(input.cell_id);
    const after =
      input.after_sequence.trim().length === 0 ? 0 : Number.parseInt(input.after_sequence, 10);
    const afterSafe = Number.isFinite(after) ? after : 0;

    const rows = this.stmtFetchWriteLog.all(afterSafe, input.limit) as {
      log_sequence: number;
      correlation_id: string;
      op: Uint8Array | Buffer;
    }[];

    const records: WriteLogRecord[] = rows.map((r) => ({
      log_sequence: String(r.log_sequence),
      correlation_id: r.correlation_id,
      op: writeOpFromBlob(asUint8(r.op)) as WriteOp,
    }));

    const lastSeq =
      rows.length > 0 ? String(rows[rows.length - 1]?.log_sequence ?? afterSafe) : "";

    return Promise.resolve({ records, next_cursor: lastSeq });
  }

  ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    this.assertCell(input.cell_id);
    this.setMeta("applied_through_sequence", input.applied_through_sequence);
    return Promise.resolve({});
  }
}

const ZERO_PAD_HASH = "0".repeat(64);

function asUint8(p: Uint8Array | Buffer): Uint8Array {
  return p instanceof Uint8Array ? p : new Uint8Array(p);
}

function parseCursor(cursor: string): number {
  if (cursor.trim().length === 0) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function verifyStaging(staging: InboxStagingPayload, resolved: ResolvedPayload | undefined): boolean {
  if (staging.kind === "inline") {
    const h = sha256HexLower(staging.inline.bytes);
    return h === staging.inline.content_hash;
  }
  if (resolved === undefined) return false;
  const ptr = staging.pointer.pointer;
  if (
    resolved.pointer.source_cell_id !== ptr.source_cell_id ||
    resolved.pointer.source_record_key !== ptr.source_record_key ||
    resolved.pointer.content_hash !== ptr.content_hash
  ) {
    return false;
  }
  const h = sha256HexLower(resolved.verified_bytes);
  return h === ptr.content_hash;
}
