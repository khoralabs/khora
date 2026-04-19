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

/// Issuing actor.
structure Party {
    /// Implementations SHOULD use UUID v7 strings.
    id: String
    ts_created: Long
    name: String
    /// Optional source-map provenance links; empty list means none.
    sourcemaps: SourceMapRefList
}

/// Proposal or workflow step; expires at `ts_expired` (epoch ms).
structure Offer {
    id: String
    ts_created: Long
    ts_expired: Long
    /// Open discriminator (domain-specific step name, e.g. workflow id).
    type: String
    sourcemaps: SourceMapRefList
}

/// Affordance: a continuation point. No lifecycle `status` field — bindability follows graph + time + capacity rules.
structure Port {
    id: String
    ts_created: Long
    ts_expired: Long
    type: String
    max_bindings: Integer
    /// Hint for agents when this affordance represents completion.
    terminal: Boolean
    /// When non-empty, this port aliases another port id for bind resolution (implementations MUST detect cycles).
    @default("")
    ref: String
    sourcemaps: SourceMapRefList
}

/// Edge record: Party -[EXTENDS]-> Offer
structure ExtendsEdge {
    id: String
    ts_created: Long
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[EXPOSES]-> Port
structure ExposesEdge {
    id: String
    ts_created: Long
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[BINDS]-> Port
structure BindsEdge {
    id: String
    ts_created: Long
    sourcemaps: SourceMapRefList
}
