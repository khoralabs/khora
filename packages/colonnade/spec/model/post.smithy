$version: "2"

namespace khora.colonnade

use smithy.api#Blob
use smithy.api#Document

structure PublicationRouting {
    /// When **`true`**, implementations MUST upsert discovery metadata / catalog pointers per **`catalog_envelope`** after outbox commit.
    /// **`fan_out_targets`** MUST be supplied by product/adapters before **`PostOperation`** (typically using deterministic cell routing such as **`derivePoolHomeCell`**); durable delivery proof is per-recipient inbox rows, not catalog documents.
    replicate_to_catalog: Boolean
    /// Opaque catalog projection (author ref, topics, probe hooks, embedding pointers, etc.).
    catalog_envelope: Document
    /// When non-empty, enqueue **`EnqueueInboxWrite`** / pointer rows on each listed recipient cell.
    fan_out_targets: FanOutTargetList
}

structure PostOperationInput {
    author_principal_id: PrincipalId
    author_cell_id: CellId
    tenant_key: TenantKey
    payload_bytes: Blob
    /// Domain-specific envelope not interpreted by Colonnade.
    payload_metadata: Document
    routing: PublicationRouting
}

structure GeneratedInboxRef {
    inbox_entry_id: InboxEntryId
    recipient_cell_id: CellId
    recipient_principal_id: PrincipalId
}

list GeneratedInboxRefList {
    member: GeneratedInboxRef
}

structure PostOperationOutput {
    outbox_record_key: OutboxRecordKey
    content_hash: ContentHash
    /// Set only when **`replicate_to_catalog`** was requested and catalog accepts pointer projection.
    catalog_pointer_id: CatalogPointerId = ""
    generated_inbox_refs: GeneratedInboxRefList
}

@documentation("""
**Post operation** — orchestrates **author outbox persistence** then optional **catalog replication** and/or **fan-out** to subscriber cells.

**Normative ordering:**
1. **`AppendOutboxRecord`** (same semantic as **`WriteOp.append_outbox`**) MUST commit payload bytes and derive **`content_hash`** before fan-out/catalog side-effects become durable.
2. If **`replicate_to_catalog`**, implementations MUST upsert discovery docs / **`UpsertCatalogPointer`** as policy requires (full payload is **not** required on catalog — pointers + hashes suffice).
3. For each **`FanOutTarget`**, implementations MUST **`EnqueueInboxDelivery`** with **`InboxStagingPayload.pointer`** referencing the author's **`OutboxLocator`**, unless an implementation-defined inline threshold allows **`inline`** payloads.

**Decision split:** This operation encodes **whether** catalog and/or fan-out occur; matching recipients via percolation MAY precede construction of **`fan_out_targets`** in embedding adapters.

**Coupling:** No Khora `POST` / `inbox_post` types appear here — adapters supply **`payload_metadata`** + **`PublicationRouting`** from product rules.
""")
service ColonnadePublication {
    version: "2026-05-15"
    operations: [
        PostOperation
    ]
}

operation PostOperation {
    input: PostOperationInput
    output: PostOperationOutput
}
