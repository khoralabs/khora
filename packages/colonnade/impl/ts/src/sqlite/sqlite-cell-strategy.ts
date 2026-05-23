import type { Database, Statement } from "bun:sqlite";
import { isOutboxEncryptedPayload, type OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";

import type {
  CellPersistenceStrategy,
  DiscardInboxEntriesInput,
} from "../cell-persistence-strategy.ts";
import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  DeleteOutboxRecordInput,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  InboxStagingPayload,
  ListOutboxRecordsForPrincipalInput,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  OutboxListedRecord,
  ResolvedPayload,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
  WriteLogRecord,
  WriteOp,
} from "../colonnade-types.ts";
import { assertContentHash, randomId, sha256HexLower } from "../hash.ts";
import { ensureCellSchema } from "./schema-cell.ts";
import { runSerializedSqliteImmediateTransaction } from "./sqlite-immediate-txn.ts";
import { applySqlitePerfPragmas } from "./sqlite-pragmas.ts";
import {
  inboxStagingFromBlob,
  inboxStagingToBlob,
  writeOpFromBlob,
  writeOpToBlob,
} from "./staging-binary.ts";

export type SqliteCellStrategyOptions = {
  readonly outboxPayloadCodec: OutboxPayloadCodec;
};

export type SqliteCellBatchCapable = {
  enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]>;
  appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]>;
};

export function supportsSqliteCellBatch(cell: unknown): cell is SqliteCellBatchCapable {
  return (
    typeof cell === "object" &&
    cell !== null &&
    "enqueueInboxDeliveriesBatch" in cell &&
    "appendWriteLogEntriesBatch" in cell &&
    typeof (cell as SqliteCellBatchCapable).enqueueInboxDeliveriesBatch === "function" &&
    typeof (cell as SqliteCellBatchCapable).appendWriteLogEntriesBatch === "function"
  );
}

export class SqliteCellPersistenceStrategy implements CellPersistenceStrategy {
  private readonly db: Database;
  private readonly cellId: string;
  private readonly stmtAppendOutbox: Statement;
  private readonly stmtEnqueueInbox: Statement;
  private readonly stmtListInbox: Statement;
  private readonly stmtCountInbox: Statement;
  private readonly stmtFetchOutbox: Statement;
  private readonly stmtDeleteOutbox: Statement;
  private readonly stmtListOutbox: Statement;
  private readonly stmtSelectInboxDrain: Statement;
  private readonly stmtDeleteInbox: Statement;
  private readonly stmtAppendWriteLog: Statement;
  private readonly stmtLastInsertRowid: Statement;
  private readonly stmtFetchWriteLog: Statement;
  private readonly stmtSetMeta: Statement;
  private readonly outboxPayloadCodec: OutboxPayloadCodec;

  constructor(db: Database, cellId: string, opts: SqliteCellStrategyOptions) {
    this.db = db;
    this.cellId = cellId;
    this.outboxPayloadCodec = opts.outboxPayloadCodec;
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
    this.stmtFetchOutbox = this.db.prepare(
      `SELECT payload, content_hash FROM outbox WHERE record_key = ?`,
    );
    this.stmtDeleteOutbox = this.db.prepare(
      `DELETE FROM outbox WHERE record_key = ? AND principal_id = ?`,
    );
    this.stmtListOutbox = this.db.prepare(
      `SELECT record_key, content_hash, metadata, committed_at_ms FROM outbox
       WHERE tenant_key = ? AND principal_id = ?
       AND (? IS NULL OR json_extract(metadata, '$.postKind') = ?)
       ORDER BY committed_at_ms DESC
       LIMIT ?`,
    );
    this.stmtSelectInboxDrain = this.db.prepare(
      `SELECT recipient_principal_id, tenant_key, staging FROM inbox WHERE inbox_entry_id = ?`,
    );
    this.stmtDeleteInbox = this.db.prepare(`DELETE FROM inbox WHERE inbox_entry_id = ?`);
    this.stmtAppendWriteLog = this.db.prepare(
      `INSERT INTO write_log(correlation_id, op) VALUES (?, ?)`,
    );
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

  runImmediateTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return runSerializedSqliteImmediateTransaction(this.db, fn);
  }

  appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    this.assertCell(input.cell_id);
    const recordKey = input.record_key.trim().length > 0 ? input.record_key : randomId("ob");
    return this.encryptAndStoreOutbox(recordKey, input);
  }

  private async encryptAndStoreOutbox(
    recordKey: string,
    input: AppendOutboxRecordInput,
  ): Promise<AppendOutboxRecordOutput> {
    let payload_bytes = input.payload_bytes;
    payload_bytes = await this.outboxPayloadCodec.encryptIfPost(input.metadata, payload_bytes);
    const content_hash = sha256HexLower(payload_bytes);
    assertContentHash(content_hash);
    const committed_at_ms = Date.now();
    this.stmtAppendOutbox.run(
      recordKey,
      input.principal_id,
      input.tenant_key,
      payload_bytes,
      JSON.stringify(input.metadata),
      content_hash,
      committed_at_ms,
    );
    return { record_key: recordKey, content_hash, committed_at_ms };
  }

  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput> {
    return Promise.resolve(this.enqueueInboxDeliverySync(input));
  }

  enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    return this.runImmediateTransaction(async () =>
      inputs.map((i) => this.enqueueInboxDeliverySync(i)),
    );
  }

  private enqueueInboxDeliverySync(input: EnqueueInboxDeliveryInput): EnqueueInboxDeliveryOutput {
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
    return { inbox_entry_id };
  }

  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    this.assertCell(input.cell_id);
    const offset = parseCursor(input.cursor);
    const rows = this.stmtListInbox.all(
      input.tenant_key,
      input.principal_id,
      input.limit,
      offset,
    ) as {
      inbox_entry_id: string;
      recipient_principal_id: string;
      staging: Uint8Array | Buffer;
      enqueued_at_ms: number;
    }[];

    const total = Number(
      (this.stmtCountInbox.get(input.tenant_key, input.principal_id) as { c: number }).c,
    );
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
    if (input.payload_format === "plaintext" && isOutboxEncryptedPayload(payload_bytes)) {
      return this.outboxPayloadCodec.decrypt(payload_bytes).then((decrypted) => ({
        payload_bytes: decrypted,
        content_hash: row.content_hash,
        bytes_available: true,
      }));
    }
    return Promise.resolve({
      payload_bytes,
      content_hash: row.content_hash,
      bytes_available: true,
    });
  }

  deleteOutboxRecord(input: DeleteOutboxRecordInput): Promise<void> {
    this.assertCell(input.cell_id);
    this.stmtDeleteOutbox.run(input.record_key, input.principal_id);
    return Promise.resolve();
  }

  listOutboxRecordsForPrincipal(
    input: ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly OutboxListedRecord[]> {
    this.assertCell(input.cell_id);
    const postKind = input.post_kind ?? null;
    const rows = this.stmtListOutbox.all(
      input.tenant_key,
      input.principal_id,
      postKind,
      postKind,
      input.limit,
    ) as {
      record_key: string;
      content_hash: string;
      metadata: string;
      committed_at_ms: number;
    }[];
    return Promise.resolve(
      rows.map((r) => {
        let metadata: unknown = {};
        try {
          metadata = JSON.parse(r.metadata) as unknown;
        } catch {
          /* keep {} */
        }
        return {
          record_key: r.record_key,
          content_hash: r.content_hash,
          metadata,
          committed_at_ms: r.committed_at_ms,
        };
      }),
    );
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
    return Promise.resolve(this.appendWriteLogEntrySync(input));
  }

  appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]> {
    return this.runImmediateTransaction(async () =>
      inputs.map((i) => this.appendWriteLogEntrySync(i)),
    );
  }

  private appendWriteLogEntrySync(input: AppendWriteLogEntryInput): AppendWriteLogEntryOutput {
    this.assertCell(input.cell_id);
    const opBlob = writeOpToBlob(input.op);
    this.stmtAppendWriteLog.run(input.correlation_id, opBlob);
    const seqRow = this.stmtLastInsertRowid.get() as { id: number };
    const log_sequence = String(seqRow.id);
    return { log_sequence };
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

    const lastSeq = rows.length > 0 ? String(rows[rows.length - 1]?.log_sequence ?? afterSafe) : "";

    return Promise.resolve({ records, next_cursor: lastSeq });
  }

  ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    this.assertCell(input.cell_id);
    this.setMeta("applied_through_sequence", input.applied_through_sequence);
    return Promise.resolve({});
  }

  purgePrincipal(principalId: string): Promise<void> {
    return this.runImmediateTransaction(async () => {
      this.db.prepare(`DELETE FROM inbox WHERE recipient_principal_id = ?`).run(principalId);
      this.db.prepare(`DELETE FROM outbox WHERE principal_id = ?`).run(principalId);
    });
  }

  discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void> {
    this.assertCell(input.cell_id);
    if (input.inbox_entry_ids.length === 0) return Promise.resolve();
    return this.runImmediateTransaction(async () => {
      const del = this.db.prepare(
        `DELETE FROM inbox WHERE inbox_entry_id = ? AND tenant_key = ? AND recipient_principal_id = ?`,
      );
      for (const id of input.inbox_entry_ids) {
        del.run(id, input.tenant_key, input.principal_id);
      }
    });
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

function verifyStaging(
  staging: InboxStagingPayload,
  resolved: ResolvedPayload | undefined,
): boolean {
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
