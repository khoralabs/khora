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

@documentation("""
**Catalog read model** — projections used while assembling publications and resolving pointer **source maps**.

**Source maps:** **`LookupSourceMapPointer`** / **`BatchLookupSourceMapPointers`** resolve **`entry_key`** → **`PointerRef`** plus a stable **`source_row_content_hash`**
for cache validation and ghost detection. Rows are written via **`CatalogIndex.UpsertSourceMapPointerRow`**.

**Hashing:** **`ComputeSourceRowContentHash`** is the normative SHA-256 binding over **`canonical_row_bytes`** so callers can verify catalog rows without fetching payloads.

**Catalog pointers:** Deployments MAY tenant-key shard catalog SQLite files; **`catalog_pointer_id`** MAY encode a shard index (`cptr_HHHH_suffix`) so **`ResolveCatalogPointer`** routes without a meta catalog.
""")
service CatalogRead {
    version: "2026-05-15"
    operations: [
        LookupSourceMapPointer
        BatchLookupSourceMapPointers
        ComputeSourceRowContentHash
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
