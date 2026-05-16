$version: "2"

namespace cfd.colonnade

use smithy.api#Blob
use smithy.api#Document

/// Input for catalog-side **fan-out target resolution** before building **`PublicationRouting.fan_out_targets`**.
structure ResolvePostFanOutTargetsInput {
    tenant_key: TenantKey
    author_principal_id: PrincipalId
    author_cell_id: CellId
    /// Payload digest after author outbox commit (matches **`PostOperationOutput.content_hash`**).
    content_hash: ContentHash
    /// Same opaque envelope intended for catalog replication / percolation (**`PublicationRouting.catalog_envelope`**).
    catalog_envelope: Document
    payload_metadata: Document
}

structure ResolvePostFanOutTargetsOutput {
    /// Recipients to enqueue via **`EnqueueInboxDelivery`** / **`FanOutTarget`** (order not normative).
    fan_out_targets: FanOutTargetList
}

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

**Fan-out:** **`ResolvePostFanOutTargets`** returns subscriber routing derived from percolation projections, stored hints, or both.
Implementations SHOULD treat **`catalog_envelope`** + **`payload_metadata`** as opaque **`Document`** probes keyed by tenant policy.

**Source maps:** **`LookupSourceMapPointer`** / **`BatchLookupSourceMapPointers`** resolve **`entry_key`** → **`PointerRef`** plus a stable **`source_row_content_hash`**
for cache validation and ghost detection. Rows are written via **`CatalogIndex.UpsertSourceMapPointerRow`**.

**Hashing:** **`ComputeSourceRowContentHash`** is the normative SHA-256 binding over **`canonical_row_bytes`** so callers can verify catalog rows without fetching payloads.
""")
service CatalogRead {
    version: "2026-05-15"
    operations: [
        ResolvePostFanOutTargets
        LookupSourceMapPointer
        BatchLookupSourceMapPointers
        ComputeSourceRowContentHash
    ]
}

operation ResolvePostFanOutTargets {
    input: ResolvePostFanOutTargetsInput
    output: ResolvePostFanOutTargetsOutput
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
