import type { CellPersistenceStrategy } from "./cell-persistence-strategy.ts";
import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  CellId,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  InboxStagingPayload,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  PendingInboxEntry,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
  WriteLogRecord,
} from "./colonnade-types.ts";
import { assertContentHash, randomId, sha256HexLower } from "./hash.ts";

type OutboxRow = {
  readonly principal_id: string;
  readonly payload: Uint8Array;
  readonly metadata: unknown;
  readonly content_hash: string;
  readonly committed_at_ms: number;
};

/**
 * Mutable **cell** store + write log for tests (single logical **`cellId`**).
 */
export class InMemoryCellPersistenceStrategy implements CellPersistenceStrategy {
  private readonly cellId: CellId;
  private readonly outbox = new Map<string, OutboxRow>();
  private readonly inbox = new Map<string, PendingInboxEntry & { tenant_key: string }>();
  private logSeq = 0;
  private readonly log: WriteLogRecord[] = [];
  private appliedThrough = "";

  constructor(cellId: CellId) {
    this.cellId = cellId;
  }

  private assertCell(cell_id: CellId): void {
    if (cell_id !== this.cellId) {
      throw new Error(
        `InMemoryCellPersistenceStrategy: cell_id mismatch (expected ${this.cellId})`,
      );
    }
  }

  async appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    this.assertCell(input.cell_id);
    const recordKey = input.record_key.trim().length > 0 ? input.record_key : randomId("ob");
    const content_hash = sha256HexLower(input.payload_bytes);
    assertContentHash(content_hash);
    const committed_at_ms = Date.now();
    this.outbox.set(recordKey, {
      principal_id: input.principal_id,
      payload: Uint8Array.from(input.payload_bytes),
      metadata: input.metadata,
      content_hash,
      committed_at_ms,
    });
    return { record_key: recordKey, content_hash, committed_at_ms };
  }

  async enqueueInboxDelivery(
    input: EnqueueInboxDeliveryInput,
  ): Promise<EnqueueInboxDeliveryOutput> {
    this.assertCell(input.cell_id);
    const inbox_entry_id = randomId("ib");
    const enqueued_at_ms = Date.now();
    this.inbox.set(inbox_entry_id, {
      inbox_entry_id,
      recipient_principal_id: input.recipient_principal_id,
      staging: cloneStaging(input.staging),
      enqueued_at_ms,
      tenant_key: input.tenant_key,
    });
    return { inbox_entry_id };
  }

  async listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    this.assertCell(input.cell_id);
    const offset = parseCursor(input.cursor);
    const rows = [...this.inbox.values()].filter(
      (e) =>
        e.recipient_principal_id === input.principal_id &&
        e.tenant_key === input.tenant_key &&
        this.cellId === input.cell_id,
    );
    rows.sort((a, b) => a.enqueued_at_ms - b.enqueued_at_ms);
    const slice = rows.slice(offset, offset + input.limit);
    const nextOffset = offset + slice.length;
    const next_cursor = nextOffset < rows.length ? String(nextOffset) : "";
    return {
      entries: slice.map((e) => ({
        inbox_entry_id: e.inbox_entry_id,
        recipient_principal_id: e.recipient_principal_id,
        staging: cloneStaging(e.staging),
        enqueued_at_ms: e.enqueued_at_ms,
      })),
      next_cursor,
    };
  }

  async fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    this.assertCell(input.cell_id);
    if (input.locator.cell_id !== this.cellId) {
      throw new Error("InMemoryCellPersistenceStrategy: locator.cell_id mismatch");
    }
    const row = this.outbox.get(input.locator.record_key);
    if (row === undefined) {
      return {
        payload_bytes: new Uint8Array(),
        content_hash: "0".repeat(64),
        bytes_available: false,
      };
    }
    assertContentHash(row.content_hash);
    return {
      payload_bytes: Uint8Array.from(row.payload),
      content_hash: row.content_hash,
      bytes_available: true,
    };
  }

  async verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    this.assertCell(input.cell_id);
    const resolvedById = new Map(input.resolved_payloads.map((r) => [r.inbox_entry_id, r]));
    const drained: string[] = [];
    const failed: string[] = [];

    for (const entryId of input.inbox_entry_ids) {
      const row = this.inbox.get(entryId);
      if (
        row === undefined ||
        row.recipient_principal_id !== input.principal_id ||
        row.tenant_key !== input.tenant_key
      ) {
        failed.push(entryId);
        continue;
      }

      const ok = verifyStaging(row.staging, resolvedById.get(entryId));
      if (!ok) {
        failed.push(entryId);
        continue;
      }
      this.inbox.delete(entryId);
      drained.push(entryId);
    }

    return { drained_entry_ids: drained, failed_entry_ids: failed };
  }

  async appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    this.assertCell(input.cell_id);
    this.logSeq += 1;
    const log_sequence = String(this.logSeq);
    this.log.push({
      log_sequence,
      correlation_id: input.correlation_id,
      op: cloneWriteOp(input.op),
    });
    return { log_sequence };
  }

  async fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    this.assertCell(input.cell_id);
    const after =
      input.after_sequence.trim().length === 0 ? 0 : Number.parseInt(input.after_sequence, 10);
    const filtered = this.log
      .filter((r) => Number.parseInt(r.log_sequence, 10) > after)
      .slice(0, input.limit);
    const lastSeq =
      filtered.length > 0
        ? (filtered[filtered.length - 1]?.log_sequence ?? input.after_sequence)
        : "";
    return {
      records: filtered.map((r) => ({
        log_sequence: r.log_sequence,
        correlation_id: r.correlation_id,
        op: cloneWriteOp(r.op),
      })),
      next_cursor: lastSeq,
    };
  }

  async ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    this.assertCell(input.cell_id);
    this.appliedThrough = input.applied_through_sequence;
    return {};
  }

  /** Test helper: last acked sequence. */
  getAppliedThrough(): string {
    return this.appliedThrough;
  }

  /** Test helper: raw log length. */
  logLength(): number {
    return this.log.length;
  }
}

function parseCursor(cursor: string): number {
  if (cursor.trim().length === 0) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function cloneStaging(s: InboxStagingPayload): InboxStagingPayload {
  if (s.kind === "inline") {
    return {
      kind: "inline",
      inline: {
        bytes: Uint8Array.from(s.inline.bytes),
        content_hash: s.inline.content_hash,
      },
    };
  }
  return {
    kind: "pointer",
    pointer: {
      pointer: { ...s.pointer.pointer },
    },
  };
}

function cloneWriteOp(
  op: import("./colonnade-types.ts").WriteOp,
): import("./colonnade-types.ts").WriteOp {
  if (op.kind === "append_outbox") {
    return {
      kind: "append_outbox",
      append_outbox: {
        ...op.append_outbox,
        payload_bytes: Uint8Array.from(op.append_outbox.payload_bytes),
      },
    };
  }
  return {
    kind: "enqueue_inbox",
    enqueue_inbox: {
      ...op.enqueue_inbox,
      staging: cloneStaging(op.enqueue_inbox.staging),
    },
  };
}

function verifyStaging(
  staging: InboxStagingPayload,
  resolved: import("./colonnade-types.ts").ResolvedPayload | undefined,
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
