$version: "2"

namespace cfd.obp.nbc

use smithy.api#Document
use cfd.obp#SourceMapRefList

@documentation("""
**Bilateral NBC turn payload** — JSON shape carried in **`cfd.obp.frame#Frame.body`** for negotiation TURN frames when peers use the Negotiated Binding Convention in a **private two-party** session.

This is **not** a public-market / multi-consumer profile: there is no bind-capacity tally, no concurrent-bind atomicity requirement, and no `terminal` hint on the port spec. Session completion is **emergent**: when neither peer exposes further bindable affordances, no further coordination is possible.

See **`cfd.obp.nbc#NegotiatedBindingConvention`** for normative NBC rules that apply here (N1 expiry, N3 ref resolution, N4 bind policy when present).
""")
structure NbcOfferSpec {
    /// Client placeholder; persistence assigns the canonical **`cfd.obp#Offer.id`**.
    id: String
    type: String
    /// Optional source-map provenance links; empty list means none (maps to **`cfd.obp#Offer.sourcemaps`**).
    sourcemaps: SourceMapRefList
    /// Turn-based NBC bind window (N1). **`0`** disables this mode. Persisted as **`nbc_expires_turn`** on the offer row — **not** a field on **`cfd.obp#Offer`**.
    expires_turn: Integer = 0
    /// Relay-anchored time bind window (N1). **`0`** disables this mode. Persisted as **`nbc_expires_at_relay_ms`** — **not** on **`cfd.obp#Offer`**.
    expires_at_relay_ms: Long = 0
}

structure NbcPortSpec {
    /// Client placeholder; persistence assigns the canonical **`cfd.obp#Port.id`**.
    id: String
    type: String
    /// Counterparty-facing affordance copy (maps to **`cfd.obp#Port.promise`**).
    @default("")
    promise: String
    /// Turn-based NBC bind window (N1). **`0`** disables this mode. Persisted as **`nbc_expires_turn`** on the port row — **not** on **`cfd.obp#Port`**.
    expires_turn: Integer = 0
    /// Relay time bind window in ms since epoch (N1). **`0`** disables this mode. Persisted as **`nbc_expires_at_relay_ms`** — **not** on **`cfd.obp#Port`**.
    expires_at_relay_ms: Long = 0
    /// When non-empty object, **`bind_payload`** on bind MUST satisfy this policy (N4); validated by the deployment **host/product** bind-policy validator before **BINDS** commits.
    bind_policy: Document = null
    /// When non-empty, aliases another port id for bind resolution (maps to **`cfd.obp#Port.ref`**); implementations MUST detect cycles.
    @default("")
    ref: String
}

list NbcPortSpecList {
    member: NbcPortSpec
}

@documentation("""
One logical **turn** in bilateral NBC: extend an offer, optionally expose new ports on that offer, and optionally bind a counterparty-exposed port from the same acting offer in this commit batch.
""")
structure NbcTurnBody {
    /// Acting party's extending offer for this turn (maps to thin **`ExtendOffer.offer`** plus **`ExtendOfferInput`** NBC projection fields).
    offer: NbcOfferSpec
    /// Affordances exposed this turn (may be empty).
    ports: NbcPortSpecList
    /// When non-empty, perform **`BindPort`** for this **`offer.id`** after extend + exposes.
    @default("")
    bind_port_id: String
    /// Counterparty satisfaction payload when **`bind_port_id`** is set.
    bind_payload: Document = null
}

@documentation("""
**Negotiated Binding Convention — bilateral negotiation protocol** (documentation service).

Normative graph + persistence operations remain **`cfd.obp#ObpPersistence`**. Live transcript rules remain **`cfd.obp.frame#NegotiationFrameProtocol`**. This service groups NBC-specific wire shapes (`NbcTurnBody`, `NbcOfferSpec`, `NbcPortSpec`) used by bilateral deployments.
""")
service NbcNegotiationProtocol {
    version: "2026-05-14"
    operations: []
}
