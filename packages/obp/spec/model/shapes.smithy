$version: "2"

namespace cfd.obp

use smithy.api#Document

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
    /// Ledger sequence when this party row was committed (session/monotonic integer—not epoch ms).
    created_seq: Long
    name: String
    /// Optional source-map provenance links; empty list means none.
    sourcemaps: SourceMapRefList
}

/// Proposal or workflow step; bindability requires **`ledger_seq < expires_seq`** (exclusive upper bound on ledger sequence).
structure Offer {
    id: String
    /// Ledger sequence when this offer was committed.
    created_seq: Long
    /// Minimum ledger sequence at which this offer is no longer bindable / extendable per expiry checks.
    expires_seq: Long
    /// Open discriminator (domain-specific step name, e.g. workflow id).
    type: String
    sourcemaps: SourceMapRefList
}

/// Affordance: a continuation point. No lifecycle `status` field — bindability follows graph + ledger-seq + capacity rules.
structure Port {
    id: String
    /// Ledger sequence when this port row was committed.
    created_seq: Long
    /// Minimum ledger sequence at which this port is no longer bindable per expiry checks.
    expires_seq: Long
    type: String
    /// Counterparty-facing affordance copy (what this port offers or invites); implementations enforcing UX SHOULD require non-empty on **ExposePort**.
    @default("")
    promise: String
    max_bindings: Integer
    /// Hint for agents when this affordance represents completion.
    terminal: Boolean
    /// When non-empty, this port aliases another port id for bind resolution (implementations MUST detect cycles).
    @default("")
    ref: String
    sourcemaps: SourceMapRefList
    /// JSON bind-policy meta-schema (structured encoding is TS/Zod `PortBindPolicy` in `@cfd/obp-core`); null means unconstrained. When non-null, **BINDS** payloads MUST satisfy this policy or the bind is rejected.
    bind_policy: Document = null
    /// Negotiation TTL basis when set: **`turns`** (relative to coordinator turns + `expose_seq`) or **`ledger_seq`** (relative to ledger ticks + `expose_seq`). Empty when unset.
    @default("")
    ttl_basis: String
    /// Interpretation depends on `ttl_basis`; null when unset.
    ttl_measure: Integer = null
    /// Ledger sequence (or coordinator turn index aligned with ledger) when this port was exposed; null when unset.
    expose_seq: Integer = null
}

/// Edge record: Party -[EXTENDS]-> Offer
structure ExtendsEdge {
    id: String
    /// Ledger sequence when this edge was committed.
    created_seq: Long
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[EXPOSES]-> Port
structure ExposesEdge {
    id: String
    /// Ledger sequence when this edge was committed.
    created_seq: Long
    sourcemaps: SourceMapRefList
}

/// Edge record: Offer -[BINDS]-> Port; carries satisfaction payload for bind-policy constraints on the target port.
structure BindsEdge {
    id: String
    /// Ledger sequence when this edge was committed.
    created_seq: Long
    sourcemaps: SourceMapRefList
    /// Data supplied by the binding offer; MUST satisfy target port `bind_policy` when that policy is present.
    counterparty_bind: Document = null
    /// Audit copy of `bind_policy` validated at bind time; informational (TS listing field `bind_policy`).
    bind_policy_snapshot: Document = null
}
