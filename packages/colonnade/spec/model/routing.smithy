$version: "2"

namespace khora.colonnade

use smithy.api#Blob
use smithy.api#Document

/// Append authoritative bytes to the **outbox** for `principal_id` on `cell_id`. Implementations MUST assign **`record_key`** if omitted.
structure AppendOutboxWrite {
    principal_id: PrincipalId
    record_key: OutboxRecordKey
    payload_bytes: Blob
    /// Opaque envelope (kind, ACL hints, topics, etc.) — not validated by Colonnade.
    metadata: Document
}

/// Stage delivery in a recipient's **inbox** on **`target_cell_id`** (fan-out pointer or inline).
structure EnqueueInboxWrite {
    target_cell_id: CellId
    recipient_principal_id: PrincipalId
    staging: InboxStagingPayload
    correlation_id: WriteCorrelationId
}

/// Single durable mutation destined for one cell's serialized writer.
union WriteOp {
    append_outbox: AppendOutboxWrite
    enqueue_inbox: EnqueueInboxWrite
}

list WriteOpList {
    member: WriteOp
}

/// Router-supplied unit of work: **`target_cell_id`** + one **`WriteOp`**.
structure RoutedWrite {
    target_cell_id: CellId
    correlation_id: WriteCorrelationId
    op: WriteOp
}

list RoutedWriteList {
    member: RoutedWrite
}

structure SubmitRoutedWritesInput {
    writes: RoutedWriteList
}

structure SubmitRoutedWritesOutput {
    /// Echo correlation ids accepted for enqueue (ordering per cell is serial).
    accepted_correlation_ids: WriteCorrelationIdList
}

structure AppendWriteLogEntryInput {
    cell_id: CellId
    correlation_id: WriteCorrelationId
    op: WriteOp
}

structure AppendWriteLogEntryOutput {
    /// Monotonic sequence / position within this cell's log (opaque or numeric string).
    log_sequence: String
}

structure FetchWriteLogBatchInput {
    cell_id: CellId
    /// Cursor into the durable log; empty starts at head.
    after_sequence: String
    limit: Integer
}

structure WriteLogRecord {
    log_sequence: String
    correlation_id: WriteCorrelationId
    op: WriteOp
}

list WriteLogRecordList {
    member: WriteLogRecord
}

structure FetchWriteLogBatchOutput {
    records: WriteLogRecordList
    next_cursor: String
}

structure AckWriteLogAppliedInput {
    cell_id: CellId
    /// Highest contiguous **`log_sequence`** durably applied by the cell worker.
    applied_through_sequence: String
}

structure AckWriteLogAppliedOutput {}

@documentation("""
**Router** — accepts batches of **`RoutedWrite`** and MUST enqueue each onto the **`target_cell_id`** write log for serialized application.

**Normative:** No cell mutation bypasses the log + single writer for that cell in conforming deployments.

**Non-normative:** Live transports MAY push bytes to online peers before or while enqueueing (fast-path); durability for offline recipients still lands in inbox staging via **`EnqueueInboxWrite`**.

**Adapter note:** Single-process hosts (e.g. today's Khora SQLite) can implement router+log as an in-memory queue + one mutex per logical cell without changing wire shapes.
""")
service ColonnadeRouter {
    version: "2026-05-15"
    operations: [
        SubmitRoutedWrites
    ]
}

operation SubmitRoutedWrites {
    input: SubmitRoutedWritesInput
    output: SubmitRoutedWritesOutput
}

@documentation("""
Per-cell **append-only write log** consumed by that cell's lone writer.

Implementations MAY collapse **`AppendWriteLogEntry`** with **`SubmitRoutedWrites`** internally; the Smithy surface separates routing intent from durable queue semantics.
""")
service CellWriteLog {
    version: "2026-05-15"
    operations: [
        AppendWriteLogEntry
        FetchWriteLogBatch
        AckWriteLogApplied
    ]
}

operation AppendWriteLogEntry {
    input: AppendWriteLogEntryInput
    output: AppendWriteLogEntryOutput
}

operation FetchWriteLogBatch {
    input: FetchWriteLogBatchInput
    output: FetchWriteLogBatchOutput
}

operation AckWriteLogApplied {
    input: AckWriteLogAppliedInput
    output: AckWriteLogAppliedOutput
}
