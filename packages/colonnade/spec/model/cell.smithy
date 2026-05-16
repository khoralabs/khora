$version: "2"

namespace cfd.colonnade

use smithy.api#Blob
use smithy.api#Document

structure AppendOutboxRecordInput {
    cell_id: CellId
    tenant_key: TenantKey
    principal_id: PrincipalId
    /// Caller MAY reserve a key; empty lets implementation mint **`OutboxRecordKey`**.
    record_key: OutboxRecordKey
    payload_bytes: Blob
    metadata: Document
}

structure AppendOutboxRecordOutput {
    record_key: OutboxRecordKey
    content_hash: ContentHash
    committed_at_ms: Long
}

structure EnqueueInboxDeliveryInput {
    cell_id: CellId
    tenant_key: TenantKey
    recipient_principal_id: PrincipalId
    staging: InboxStagingPayload
    correlation_id: WriteCorrelationId
}

structure EnqueueInboxDeliveryOutput {
    inbox_entry_id: InboxEntryId
}

structure PendingInboxEntry {
    inbox_entry_id: InboxEntryId
    recipient_principal_id: PrincipalId
    staging: InboxStagingPayload
    enqueued_at_ms: Long
}

list PendingInboxEntryList {
    member: PendingInboxEntry
}

structure ListPendingInboxEntriesInput {
    cell_id: CellId
    tenant_key: TenantKey
    principal_id: PrincipalId
    limit: Integer
    cursor: DrainCursor
}

structure ListPendingInboxEntriesOutput {
    entries: PendingInboxEntryList
    next_cursor: DrainCursor
}

structure FetchOutboxPayloadInput {
    cell_id: CellId
    locator: OutboxLocator
}

structure FetchOutboxPayloadOutput {
    payload_bytes: Blob
    content_hash: ContentHash
    /// When **`false`**, bytes were deleted — inbox drain MUST surface **ghost / unresolvable** state while retaining metadata elsewhere (see catalog ghost records).
    bytes_available: Boolean
}

structure VerifyAndDrainInboxBatchInput {
    cell_id: CellId
    tenant_key: TenantKey
    principal_id: PrincipalId
    /// Entries to finalize after verification (typically produced by **`ListPendingInboxEntries`**).
    inbox_entry_ids: InboxEntryIdList
    /// For **`pointer`** staging rows, implementations MAY pass freshly fetched bytes here or refetch via **`FetchOutboxPayload`** using **`PointerRef`**.
    resolved_payloads: ResolvedPayloadList
}

list InboxEntryIdList {
    member: InboxEntryId
}

structure ResolvedPayload {
    inbox_entry_id: InboxEntryId
    pointer: PointerRef
    /// Bytes MUST hash to **`pointer.content_hash`** under canonical rules.
    verified_bytes: Blob
}

list ResolvedPayloadList {
    member: ResolvedPayload
}

structure VerifyAndDrainInboxBatchOutput {
    drained_entry_ids: InboxEntryIdList
    /// Entries that could not be verified or resolved (caller retries or surfaces errors).
    failed_entry_ids: InboxEntryIdList
}

@documentation("""
**Cell store** — logical persistence for one **cell** (shard).

**Outbox (normative):**
- Authoritative bytes for published network-visible payloads live here.
- Append-only from the publisher's perspective for a given **`record_key`** policy; Colonnade does not mandate deletion semantics — implementations MAY remove bytes for erasure while retaining hashes elsewhere (**ghost** state).

**Inbox (normative):**
- Staging area for recipients while principals are offline or slow.
- Rows hold **`InboxStagingPayload`** (**inline** small payloads OR **pointer** + expected **`ContentHash`**).
- **Drain:** Implementations MUST **`FetchOutboxPayload`** (or equivalent) for pointer rows, verify digest equals expected hash, then enrich local projection and **`VerifyAndDrainInboxBatch`** removes staging rows.

**Fan-out (normative):** Subscriber deliveries enqueue **`EnqueueInboxDelivery`** on **each recipient cell** with pointer rows referencing the author's outbox — not only on the catalog.

**Isolation:** Cells are independent failure domains; corrupting one MUST NOT imply reads across tenant boundaries without explicit routing.

**Future adapters:** Atrium-style notifications map naturally to **`EnqueueInboxDelivery`** + drain; entity bodies map to **`AppendOutboxRecord`**.
""")
service CellStore {
    version: "2026-05-15"
    operations: [
        AppendOutboxRecord
        EnqueueInboxDelivery
        ListPendingInboxEntries
        FetchOutboxPayload
        VerifyAndDrainInboxBatch
    ]
}

operation AppendOutboxRecord {
    input: AppendOutboxRecordInput
    output: AppendOutboxRecordOutput
}

operation EnqueueInboxDelivery {
    input: EnqueueInboxDeliveryInput
    output: EnqueueInboxDeliveryOutput
}

operation ListPendingInboxEntries {
    input: ListPendingInboxEntriesInput
    output: ListPendingInboxEntriesOutput
}

operation FetchOutboxPayload {
    input: FetchOutboxPayloadInput
    output: FetchOutboxPayloadOutput
}

operation VerifyAndDrainInboxBatch {
    input: VerifyAndDrainInboxBatchInput
    output: VerifyAndDrainInboxBatchOutput
}
