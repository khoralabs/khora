$version: "2"

namespace cfd.obp.nbc

use smithy.api#Document

/// Bind capacity, terminal UX hint, constraints, and negotiation TTL hints for a port **at expose time**, owned by the NBC layer.
/// Thin **`cfd.obp#Port`** does not carry these fields; NBC-conformant deployments evaluate them **before** delegating to **`cfd.obp#ObpPersistence`** when policy applies.
structure NbcPortExposePolicy {
    /// Maximum successful binds against this port after **`cfd.obp#Port.ref`** resolution to canonical id. Omitted on wire means **1** when this structure is present.
    max_bindings: Integer = 1
    /// Hint for agents when this affordance represents completion; does not change OBP graph topology—NBC uses it for orchestration and UX policy.
    terminal: Boolean = false
    /// Application-defined JSON profile for required counterparty fields at bind time; null or empty object means no extra NBC bind form beyond OBP graph rules.
    bind_policy: Document = null
    /// When set: **`turns`** (relative to coordinator + `expose_seq`) or **`ledger_seq`** (relative to ledger + `expose_seq`). Empty when unset.
    @default("")
    ttl_basis: String
    /// Interpretation depends on **`ttl_basis`**; null when unset.
    ttl_measure: Integer = null
    /// Coordinator turn index or ledger-aligned tick when this policy was attached to the expose; null when unset.
    expose_seq: Integer = null
}

/// Counterparty satisfaction data for a **BINDS** commit; persists with the bind via **`ObpPersistence`** (**`counterparty_bind`** **`Document`**), not on **`cfd.obp#BindsEdge`**. NBC validates **`payload`** against **`NbcPortExposePolicy.bind_policy`** when claiming NBC conformance.
structure NbcBindSatisfaction {
    payload: Document
}

/// Optional audit copy of the **`NbcPortExposePolicy`** (or digest thereof) enforced at bind time; persists via **`ObpPersistence`** **`bind_policy_snapshot`** **`Document`** on bind rows / listings, not on **`cfd.obp#BindsEdge`**.
structure NbcBindPolicyAuditSnapshot {
    snapshot: Document
}

/// First-commit ledger tick for a persisted **`cfd.obp`** graph row (**`Party`**, **`Offer`**, **`Port`**, or an edge). **Not** a member of those shapes in `packages/obp/v2/model/spec/model/shapes.smithy`; **`ObpPersistence`** and NBC-aware adapters record **`created_seq`** (or equivalent) when they require monotonic row ordering or audit.
structure NbcRowCommitMeta {
    created_seq: Long
}
