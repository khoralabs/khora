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
} from "../../core";
import { assertContentHash, randomId, sha256HexLower } from "../../core";
import { isOutboxEncryptedPayload, type OutboxPayloadCodec } from "../../crypto";
import type { CellPersistence, DiscardInboxEntriesInput } from "../core";
import { inboxStagingFromBlob, inboxStagingToBlob, writeOpFromBlob, writeOpToBlob } from "../core";
import type { TursoClients } from "./client";
import { execSql, queryAll, queryOne } from "./client";
import { migrateCellTursoServerless } from "./migrations/cell-migrations";
import { runSerializedTursoTransaction } from "./turso-immediate-txn";

export type TursoCellStrategyOptions = {
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  readonly autoMigrate?: boolean;
};

export type TursoCellBatchCapable = {
  enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]>;
  appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]>;
};

export function supportsTursoCellBatch(cell: unknown): cell is TursoCellBatchCapable {
  return (
    typeof cell === "object" &&
    cell !== null &&
    "enqueueInboxDeliveriesBatch" in cell &&
    "appendWriteLogEntriesBatch" in cell &&
    typeof (cell as TursoCellBatchCapable).enqueueInboxDeliveriesBatch === "function" &&
    typeof (cell as TursoCellBatchCapable).appendWriteLogEntriesBatch === "function"
  );
}

const CELL_POOL_COUNT_META_KEY = "cell_pool_count";

export class TursoCellPersistence implements CellPersistence {
  private readonly outboxPayloadCodec: OutboxPayloadCodec;

  private constructor(
    private readonly db: TursoClients,
    private readonly cellId: string,
    outboxPayloadCodec: OutboxPayloadCodec,
  ) {
    this.outboxPayloadCodec = outboxPayloadCodec;
  }

  static async open(
    db: TursoClients,
    cellId: string,
    opts: TursoCellStrategyOptions,
  ): Promise<TursoCellPersistence> {
    if (opts.autoMigrate !== false) {
      await migrateCellTursoServerless(db);
    }
    return new TursoCellPersistence(db, cellId, opts.outboxPayloadCodec);
  }

  async ensureCellPoolCount(expected: number): Promise<void> {
    const row = await queryOne<{ value: string }>(
      this.db.read,
      `SELECT value FROM cell_meta WHERE key = ?`,
      [CELL_POOL_COUNT_META_KEY],
    );
    if (row === undefined) {
      await execSql(
        this.db.write,
        `INSERT INTO cell_meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [CELL_POOL_COUNT_META_KEY, String(expected)],
      );
      return;
    }
    const stored = Number.parseInt(row.value, 10);
    if (stored !== expected) {
      throw new Error(
        `TursoCellPersistence: cell_pool_count mismatch (stored ${stored}, expected ${expected})`,
      );
    }
  }

  private assertCell(cell_id: string): void {
    if (cell_id !== this.cellId) {
      throw new Error(`TursoCellPersistence: cell_id mismatch (expected ${this.cellId})`);
    }
  }

  runImmediateTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return runSerializedTursoTransaction(this.db, fn);
  }

  async appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
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
    await execSql(
      this.db.write,
      `INSERT INTO outbox(record_key, principal_id, tenant_key, payload, metadata, content_hash, committed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recordKey,
        input.principal_id,
        input.tenant_key,
        payload_bytes,
        JSON.stringify(input.metadata),
        content_hash,
        committed_at_ms,
      ],
    );
    return { record_key: recordKey, content_hash, committed_at_ms };
  }

  async enqueueInboxDelivery(
    input: EnqueueInboxDeliveryInput,
  ): Promise<EnqueueInboxDeliveryOutput> {
    return this.runImmediateTransaction(async () => this.enqueueInboxDeliverySync(input));
  }

  async enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    return this.runImmediateTransaction(async () =>
      Promise.all(inputs.map((i) => this.enqueueInboxDeliverySync(i))),
    );
  }

  private async enqueueInboxDeliverySync(
    input: EnqueueInboxDeliveryInput,
  ): Promise<EnqueueInboxDeliveryOutput> {
    this.assertCell(input.cell_id);
    const inbox_entry_id = randomId("ib");
    const enqueued_at_ms = Date.now();
    const staging = inboxStagingToBlob(input.staging);
    await execSql(
      this.db.write,
      `INSERT INTO inbox(inbox_entry_id, tenant_key, recipient_principal_id, staging, enqueued_at_ms, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        inbox_entry_id,
        input.tenant_key,
        input.recipient_principal_id,
        staging,
        enqueued_at_ms,
        input.correlation_id,
      ],
    );
    return { inbox_entry_id };
  }

  async listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    this.assertCell(input.cell_id);
    const offset = parseCursor(input.cursor);
    const rows = await queryAll<{
      inbox_entry_id: string;
      recipient_principal_id: string;
      staging: Uint8Array | ArrayBuffer;
      enqueued_at_ms: number;
    }>(
      this.db.read,
      `SELECT inbox_entry_id, recipient_principal_id, staging, enqueued_at_ms FROM inbox
       WHERE tenant_key = ? AND recipient_principal_id = ?
       ORDER BY enqueued_at_ms ASC
       LIMIT ? OFFSET ?`,
      [input.tenant_key, input.principal_id, input.limit, offset],
    );

    const countRow = await queryOne<{ c: number }>(
      this.db.read,
      `SELECT COUNT(*) AS c FROM inbox WHERE tenant_key = ? AND recipient_principal_id = ?`,
      [input.tenant_key, input.principal_id],
    );
    const total = Number(countRow?.c ?? 0);
    const nextOffset = offset + rows.length;
    const next_cursor = nextOffset < total ? String(nextOffset) : "";

    const entries = rows.map((r) => ({
      inbox_entry_id: r.inbox_entry_id,
      recipient_principal_id: r.recipient_principal_id,
      staging: inboxStagingFromBlob(asUint8(r.staging)),
      enqueued_at_ms: r.enqueued_at_ms,
    }));

    return { entries, next_cursor };
  }

  async fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    this.assertCell(input.cell_id);
    if (input.locator.cell_id !== this.cellId) {
      throw new Error("TursoCellPersistence: locator.cell_id mismatch");
    }
    const row = await queryOne<{ payload: Uint8Array | ArrayBuffer; content_hash: string }>(
      this.db.read,
      `SELECT payload, content_hash FROM outbox WHERE record_key = ?`,
      [input.locator.record_key],
    );
    if (row === undefined) {
      return {
        payload_bytes: new Uint8Array(),
        content_hash: ZERO_PAD_HASH,
        bytes_available: false,
      };
    }
    const payload_bytes = asUint8(row.payload);
    assertContentHash(row.content_hash);
    if (input.payload_format === "plaintext" && isOutboxEncryptedPayload(payload_bytes)) {
      const decrypted = await this.outboxPayloadCodec.decrypt(payload_bytes);
      return {
        payload_bytes: decrypted,
        content_hash: row.content_hash,
        bytes_available: true,
      };
    }
    return {
      payload_bytes,
      content_hash: row.content_hash,
      bytes_available: true,
    };
  }

  async deleteOutboxRecord(input: DeleteOutboxRecordInput): Promise<void> {
    this.assertCell(input.cell_id);
    await execSql(this.db.write, `DELETE FROM outbox WHERE record_key = ? AND principal_id = ?`, [
      input.record_key,
      input.principal_id,
    ]);
  }

  async listOutboxRecordsForPrincipal(
    input: ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly OutboxListedRecord[]> {
    this.assertCell(input.cell_id);
    const postKind = input.post_kind ?? null;
    const rows = await queryAll<{
      record_key: string;
      content_hash: string;
      metadata: string;
      committed_at_ms: number;
    }>(
      this.db.read,
      `SELECT record_key, content_hash, metadata, committed_at_ms FROM outbox
       WHERE tenant_key = ? AND principal_id = ?
       AND (? IS NULL OR json_extract(metadata, '$.postKind') = ?)
       ORDER BY committed_at_ms DESC
       LIMIT ?`,
      [input.tenant_key, input.principal_id, postKind, postKind, input.limit],
    );
    return rows.map((r) => {
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
    });
  }

  async verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    this.assertCell(input.cell_id);
    const resolvedById = new Map(input.resolved_payloads.map((r) => [r.inbox_entry_id, r]));
    const drained: string[] = [];
    const failed: string[] = [];

    for (const entryId of input.inbox_entry_ids) {
      const row = await queryOne<{
        recipient_principal_id: string;
        tenant_key: string;
        staging: Uint8Array | ArrayBuffer;
      }>(
        this.db.read,
        `SELECT recipient_principal_id, tenant_key, staging FROM inbox WHERE inbox_entry_id = ?`,
        [entryId],
      );

      if (
        row === undefined ||
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

      await execSql(this.db.write, `DELETE FROM inbox WHERE inbox_entry_id = ?`, [entryId]);
      drained.push(entryId);
    }

    return { drained_entry_ids: drained, failed_entry_ids: failed };
  }

  async appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    return this.appendWriteLogEntrySync(input);
  }

  async appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]> {
    return this.runImmediateTransaction(async () =>
      Promise.all(inputs.map((i) => this.appendWriteLogEntrySync(i))),
    );
  }

  private async appendWriteLogEntrySync(
    input: AppendWriteLogEntryInput,
  ): Promise<AppendWriteLogEntryOutput> {
    this.assertCell(input.cell_id);
    const opBlob = writeOpToBlob(input.op);
    await execSql(this.db.write, `INSERT INTO write_log(correlation_id, op) VALUES (?, ?)`, [
      input.correlation_id,
      opBlob,
    ]);
    const seqRow = await queryOne<{ id: number }>(
      this.db.write,
      `SELECT last_insert_rowid() AS id`,
    );
    const log_sequence = String(seqRow?.id ?? 0);
    return { log_sequence };
  }

  async fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    this.assertCell(input.cell_id);
    const after =
      input.after_sequence.trim().length === 0 ? 0 : Number.parseInt(input.after_sequence, 10);
    const afterSafe = Number.isFinite(after) ? after : 0;

    const rows = await queryAll<{
      log_sequence: number;
      correlation_id: string;
      op: Uint8Array | ArrayBuffer;
    }>(
      this.db.read,
      `SELECT log_sequence, correlation_id, op FROM write_log WHERE log_sequence > ? ORDER BY log_sequence ASC LIMIT ?`,
      [afterSafe, input.limit],
    );

    const records: WriteLogRecord[] = rows.map((r) => ({
      log_sequence: String(r.log_sequence),
      correlation_id: r.correlation_id,
      op: writeOpFromBlob(asUint8(r.op)) as WriteOp,
    }));

    const lastSeq = rows.length > 0 ? String(rows[rows.length - 1]?.log_sequence ?? afterSafe) : "";

    return { records, next_cursor: lastSeq };
  }

  async ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    this.assertCell(input.cell_id);
    await execSql(
      this.db.write,
      `INSERT INTO cell_meta(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["applied_through_sequence", input.applied_through_sequence],
    );
    return {};
  }

  async purgePrincipal(principalId: string): Promise<void> {
    await this.runImmediateTransaction(async () => {
      await execSql(this.db.write, `DELETE FROM inbox WHERE recipient_principal_id = ?`, [
        principalId,
      ]);
      await execSql(this.db.write, `DELETE FROM outbox WHERE principal_id = ?`, [principalId]);
    });
  }

  async discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void> {
    this.assertCell(input.cell_id);
    if (input.inbox_entry_ids.length === 0) return;
    await this.runImmediateTransaction(async () => {
      for (const id of input.inbox_entry_ids) {
        await execSql(
          this.db.write,
          `DELETE FROM inbox WHERE inbox_entry_id = ? AND tenant_key = ? AND recipient_principal_id = ?`,
          [id, input.tenant_key, input.principal_id],
        );
      }
    });
  }

  async close(): Promise<void> {
    await this.db.read.close();
    await this.db.write.close();
  }
}

const ZERO_PAD_HASH = "0".repeat(64);

function asUint8(p: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (p instanceof Uint8Array) return p;
  if (p instanceof ArrayBuffer) return new Uint8Array(p);
  return new Uint8Array(p);
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
