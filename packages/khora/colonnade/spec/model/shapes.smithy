$version: "2"

namespace khora.colonnade

use smithy.api#Blob
use smithy.api#Document

/// Logical **cell** / shard identifier (implementation assigns routing; e.g. hash of tenant principal).
@pattern("^[a-zA-Z0-9._:@/-]+$")
string CellId

/// Tenant or tenant-group key used for routing writes and isolation boundaries.
@pattern("^[a-zA-Z0-9._:@/-]+$")
string TenantKey

/// Stable principal identifier (opaque to Colonnade — DID, profile id, etc.).
@pattern("^[a-zA-Z0-9._:@/-]+$")
string PrincipalId

/// Monotonic or lexicographic cursor for paginating inbox drains (opaque token).
string DrainCursor

/// Client-supplied idempotency / correlation key for writes (opaque).
string WriteCorrelationId

list WriteCorrelationIdList {
    member: WriteCorrelationId
}

/// Stable identifier for an **inbox staging row** before drain completes.
string InboxEntryId

/// Stable identifier for an **outbox record** within a cell (implementation-defined).
string OutboxRecordKey

/// Stable identifier for a **catalog-retained pointer** row (subset of all pointers in the system).
string CatalogPointerId

/// Logical **source map** bundle id (catalog-scoped); rows map opaque **`entry_key`** → pointer + projection.
@pattern("^[a-zA-Z0-9._:@/-]+$")
string SourceMapId

/// Lowercase SHA-256 digest of canonical payload bytes (**no** `0x`), length **64**.
/// Implementations MUST compute hashes over a documented canonical encoding for each payload class.
@pattern("^[0-9a-f]{64}$")
string ContentHash

/// Reference to a principal inside Colonnade routing (opaque id).
structure PrincipalRef {
    principal_id: PrincipalId
}

/// Cell + optional tenant binding for ACL / placement hints.
structure CellRef {
    cell_id: CellId
    /// When unset, implementations derive tenant scope from routing policy.
    tenant_key: TenantKey
}

/// Locates authoritative bytes in an author's **outbox** on a specific cell.
structure OutboxLocator {
    cell_id: CellId
    record_key: OutboxRecordKey
}

/// Pointer to remote **outbox** payload used for inbox staging and catalog resolution.
structure PointerRef {
    source_cell_id: CellId
    source_record_key: OutboxRecordKey
    /// Expected digest of the canonical bytes at **`source_*`** at enqueue time (MUST match after fetch when verifying).
    content_hash: ContentHash
}

/// Small payloads MAY be **inlined** in the recipient inbox (e.g. under ~2KB) to reduce scatter-gather on drain.
structure InlinePayload {
    bytes: Blob
    content_hash: ContentHash
}

/// Larger payloads stay as **pointers** to the author's outbox; drain resolves + verifies hash.
structure PointerPayload {
    pointer: PointerRef
}

/// What an inbox row holds before drain: either inline bytes or an outbox pointer + expected hash.
union InboxStagingPayload {
    inline: InlinePayload
    pointer: PointerPayload
}

/// Recipient + cell for fan-out inbox enqueue.
structure FanOutTarget {
    recipient_cell_id: CellId
    recipient_principal_id: PrincipalId
}

list FanOutTargetList {
    member: FanOutTarget
}

/// Single resolved row from a **source map** read (pointer + content-addressable row fingerprint).
structure SourceMapPointerHit {
    entry_key: String
    pointer: PointerRef
    /// SHA-256 (hex lower) of **`ComputeSourceRowContentHash`** / catalog canonical row encoding for this binding.
    source_row_content_hash: ContentHash
    projection: Document
}

list SourceMapEntryKeyList {
    member: String
}

list SourceMapPointerHitList {
    member: SourceMapPointerHit
}
