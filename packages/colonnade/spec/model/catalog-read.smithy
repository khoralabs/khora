$version: "2"

namespace khora.colonnade

use smithy.api#Blob
use smithy.api#Document

structure LookupSourceMapPointerInput {
    tenant_key: TenantKey
    source_map_id: SourceMapId
    /// Opaque segment id within the map (topic fragment, chunk key, etc.).
    entry_key: String
}

structure LookupSourceMapPointerOutput {
    found: Boolean
    /// Valid only when **`found`**; otherwise zero-valued / ignored.
    pointer: PointerRef
    /// Absent hits use all-zero digest (**ghost** / sentinel); **`found`** gates interpretation.
    source_row_content_hash: ContentHash = "0000000000000000000000000000000000000000000000000000000000000000"
    projection: Document
}

structure BatchLookupSourceMapPointersInput {
    tenant_key: TenantKey
    source_map_id: SourceMapId
    entry_keys: SourceMapEntryKeyList
}

structure BatchLookupSourceMapPointersOutput {
    hits: SourceMapPointerHitList
}

structure ComputeSourceRowContentHashInput {
    /// Canonical serialization of a source-map row (versioned form agreed with **`UpsertSourceMapPointerRow`** implementations).
    canonical_row_bytes: Blob
}

structure ComputeSourceRowContentHashOutput {
    content_hash: ContentHash
}

structure ListPublicationPointersInput {
    tenant_key: TenantKey
    limit: Integer
    /// Opaque keyset cursor from a prior **`ListPublicationPointers`** response (`next_cursor`).
    cursor: String
    publisher_principal_id: PrincipalId
    /// AND semantics: every listed tag MUST be present on the publication.
    tags_all: StringList
}

structure PublicationPointerEntry {
    catalog_pointer_id: CatalogPointerId
    publication_key: String
    publisher_principal_id: PrincipalId
    published_at_ms: Long
    tags: StringList
    locator: OutboxLocator
    content_hash: ContentHash
    public_projection: Document
}

list PublicationPointerEntryList {
    member: PublicationPointerEntry
}

structure ListPublicationPointersOutput {
    entries: PublicationPointerEntryList
    /// Empty when no further pages.
    next_cursor: String = ""
}

structure CountPublicationPointersAfterInput {
    tenant_key: TenantKey
    after_ms: Long
    publisher_principal_id: PrincipalId
    tags_all: StringList
}

structure CountPublicationPointersAfterOutput {
    count: Integer
}

@documentation("""
**Catalog read model** — projections used while assembling publications and resolving pointer **source maps**.

**Source maps:** **`LookupSourceMapPointer`** / **`BatchLookupSourceMapPointers`** resolve **`entry_key`** → **`PointerRef`** plus a stable **`source_row_content_hash`**
for cache validation and ghost detection. Rows are written via **`CatalogIndex.UpsertSourceMapPointerRow`**.

**Publication feed:** **`ListPublicationPointers`** / **`CountPublicationPointersAfter`** provide a tenant-scoped chronological public timeline over catalog pointers (not outbox payloads). Ordering is **`published_at_ms DESC`**, then **`catalog_pointer_id DESC`**. Cursor is an opaque keyset encoding of that tuple.

**Hashing:** **`ComputeSourceRowContentHash`** is the normative SHA-256 binding over **`canonical_row_bytes`** so callers can verify catalog rows without fetching payloads.

**Catalog pointers:** Deployments MAY tenant-key shard catalog SQLite files; **`catalog_pointer_id`** MAY encode a shard index (`cptr_HHHH_suffix`) so **`ResolveCatalogPointer`** routes without a meta catalog.
""")
service CatalogRead {
    version: "2026-05-15"
    operations: [
        LookupSourceMapPointer
        BatchLookupSourceMapPointers
        ComputeSourceRowContentHash
        ListPublicationPointers
        CountPublicationPointersAfter
    ]
}

operation LookupSourceMapPointer {
    input: LookupSourceMapPointerInput
    output: LookupSourceMapPointerOutput
}

operation BatchLookupSourceMapPointers {
    input: BatchLookupSourceMapPointersInput
    output: BatchLookupSourceMapPointersOutput
}

operation ComputeSourceRowContentHash {
    input: ComputeSourceRowContentHashInput
    output: ComputeSourceRowContentHashOutput
}

operation ListPublicationPointers {
    input: ListPublicationPointersInput
    output: ListPublicationPointersOutput
}

operation CountPublicationPointersAfter {
    input: CountPublicationPointersAfterInput
    output: CountPublicationPointersAfterOutput
}
