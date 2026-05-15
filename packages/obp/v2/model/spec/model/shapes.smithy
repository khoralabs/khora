$version: "2"

namespace cfd.obp

/// Optional provenance link: a **source map** reference within OBP (store-agnostic). Fields are opaque to the protocol;
/// embedding apps and adapters assign meaning (e.g. a backing store may map `resource_id` / `source_key` to its own rows).
structure SourceMapRef {
    /// Opaque resource identifier (e.g. document or corpus id in the embedding application).
    resource_id: String
    /// Locator within that resource (slice key, segment id, etc.).
    source_key: String
}

list SourceMapRefList {
    member: SourceMapRef
}

/// Lowercase SHA-256 digest of resolved body bytes (**no** `0x`), length **64**. Embedding defines how **`resource_id`** / **`source_key`** resolve to bytes.
@pattern("^[0-9a-f]{64}$")
string Sha256HexLower

/// Abstract **content receipt**: opaque source addressing plus a digest commitment (e.g. memories `content_hash` profile). OBP does not define resolution—only the wire shape.
structure ContentAddressedSourceRef {
    resource_id: String
    source_key: String
    content_sha256_hex: Sha256HexLower
}

list ContentAddressedSourceRefList {
    member: ContentAddressedSourceRef
}

/// Issuing actor. Row commit ordering (**`created_seq`**) is an NBC / **`ObpPersistence`** projection concern, not a field on this shape.
structure Party {
    /// Implementations SHOULD use UUID v7 strings.
    id: String
    name: String
    /// Optional source-map provenance links; empty list means none.
    sourcemaps: SourceMapRefList
}

/// Proposal or workflow step — **identity** and open **`type`** plus **`sourcemaps`**. NBC bind-window (**`expires_turn`** / **`expires_at_relay_ms`**) is **not** a core graph field: it lives on **`cfd.obp.nbc`** TURN wire (`NbcOfferSpec`) and on the **`ObpPersistence`** NBC projection columns (**`nbc_expires_*`**, see **`cfd.obp#ExtendOfferInput`**). Row **`created_seq`** is NBC / persistence (**`cfd.obp.nbc#NbcRowCommitMeta`**), not on this shape.
structure Offer {
    id: String
    /// Open discriminator (domain-specific step name, e.g. workflow id).
    type: String
    sourcemaps: SourceMapRefList
}

/// Affordance: a continuation point — **identity**, **`type`**, **`promise`**, **`ref`**, **`sourcemaps`**. NBC bind-window timing is **not** on this core shape; see **`cfd.obp.nbc#NbcPortSpec`** and **`cfd.obp#ExposePortInput`** projection fields. **How many** binds and **terminal UX context** are **`cfd.obp.nbc#NbcPortExposePolicy`** when NBC applies. Row commit ordering (**`created_seq`**) is NBC / persistence, not on this shape.
structure Port {
    id: String
    type: String
    /// Counterparty-facing affordance copy (what this port offers or invites); implementations enforcing UX SHOULD require non-empty on **ExposePort**.
    @default("")
    promise: String
    /// When non-empty, this port aliases another port id for bind resolution (implementations MUST detect cycles).
    @default("")
    ref: String
    sourcemaps: SourceMapRefList
}

/// Edge record: Party -[EXTENDS]-> Offer. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure ExtendsEdge {
    id: String
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[EXPOSES]-> Port. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure ExposesEdge {
    id: String
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[BINDS]-> Port — graph identity and provenance only. Policy-shaped bind payloads (**`cfd.obp.nbc#NbcBindSatisfaction`**, **`cfd.obp.nbc#NbcBindPolicyAuditSnapshot`**) and **`ObpPersistence`** bind operation **`Document`** fields are defined outside this shape. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure BindsEdge {
    id: String
    sourcemaps: SourceMapRefList
    /// Optional digest receipts for named sources (embedding-defined resolution and byte encoding).
    content_receipts: ContentAddressedSourceRefList
}
