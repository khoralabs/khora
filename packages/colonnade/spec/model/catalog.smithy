$version: "2"

namespace khora.colonnade

use smithy.api#Document

structure UpsertDiscoveryDocumentInput {
    /// Namespaced key for public metadata row (opaque convention).
    document_key: String
    body: Document
}

structure UpsertDiscoveryDocumentOutput {
    revision_token: String
}

structure UpsertCatalogPointerInput {
    catalog_pointer_id: CatalogPointerId
    /// Target authoritative payload location (**subset** of global pointers — inbox pointers often exist **only** on recipient cells).
    locator: OutboxLocator
    content_hash: ContentHash
    /// Optional public projection (title, topics, embedding refs, etc.).
    public_projection: Document
}

structure UpsertCatalogPointerOutput {}

structure ResolveCatalogPointerInput {
    catalog_pointer_id: CatalogPointerId
}

structure ResolveCatalogPointerOutput {
    locator: OutboxLocator
    content_hash: ContentHash
    /// Cell hosting the outbox referenced by **`locator`**.
    cell: CellRef
}

structure IssueConnectionTokenInput {
    principal_id: PrincipalId
    intended_audience: String
    ttl_seconds: Integer
}

structure IssueConnectionTokenOutput {
    token: String
    expires_at_ms: Long
}

structure UpsertSourceMapPointerRowInput {
    tenant_key: TenantKey
    source_map_id: SourceMapId
    entry_key: String
    pointer: PointerRef
    /// Opaque segment metadata surfaced on **`CatalogRead`** lookups (topics, spans, embedding offsets, …).
    projection: Document
}

structure UpsertSourceMapPointerRowOutput {
    /// Same digest returned by **`ComputeSourceRowContentHash`** for the canonical encoding of this row.
    source_row_content_hash: ContentHash
}

@documentation("""
**Catalog** — cross-cell discovery / indexing engine.

**Normative:**
- Stores **public metadata** (profiles, post stubs, embedding ids) as opaque **`Document`** rows keyed by **`document_key`** — Colonnade does not validate domain schemas.
- Retains **only some** **`UpsertCatalogPointer`** rows for global resolution; **fan-out inbox pointer rows** primarily live on recipient cells.
- **`UpsertSourceMapPointerRow`** retains **source-map** rows for **`CatalogRead`** pointer lookups with content-addressable **`source_row_content_hash`**.
- **`ResolveCatalogPointer`** MUST return enough location information to open **`FetchOutboxPayload`** on the correct cell when bytes still exist.

**Security:** Content-addressing applies to outbox bytes (see **`ContentHash`**). If bytes are erased at source, catalog MAY retain **ghost** projection rows — **`FetchOutboxPayload`** reports **`bytes_available = false`**.

**Connection tokens:** **`IssueConnectionToken`** models short-lived discovery aids without exposing raw network identifiers globally (**§5 / Token Registry** narrative in package `.idea/spec.md`).

**Non-normative:** Fast-path push to WebSockets is outside this persistence surface.
""")
service CatalogIndex {
    version: "2026-05-15"
    operations: [
        UpsertDiscoveryDocument
        UpsertCatalogPointer
        ResolveCatalogPointer
        UpsertSourceMapPointerRow
        IssueConnectionToken
    ]
}

operation UpsertDiscoveryDocument {
    input: UpsertDiscoveryDocumentInput
    output: UpsertDiscoveryDocumentOutput
}

operation UpsertCatalogPointer {
    input: UpsertCatalogPointerInput
    output: UpsertCatalogPointerOutput
}

operation ResolveCatalogPointer {
    input: ResolveCatalogPointerInput
    output: ResolveCatalogPointerOutput
}

operation UpsertSourceMapPointerRow {
    input: UpsertSourceMapPointerRowInput
    output: UpsertSourceMapPointerRowOutput
}

operation IssueConnectionToken {
    input: IssueConnectionTokenInput
    output: IssueConnectionTokenOutput
}
