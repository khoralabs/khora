$version: "2"

namespace cfd.obp.nbc

use smithy.api#Document
use cfd.obp#Offer

@documentation("""
**Bilateral NBC turn payload** — JSON shape carried in **`cfd.obp.frame#Frame.body`** for negotiation TURN frames when peers use the Negotiated Binding Convention in a **private two-party** session.

This is **not** a public-market / multi-consumer profile: there is no bind-capacity tally, no concurrent-bind atomicity requirement, and no `terminal` hint on the port spec. Session completion is **emergent**: when neither peer exposes further bindable affordances, no further coordination is possible.

See **`cfd.obp.nbc#NegotiatedBindingConvention`** for normative NBC rules that apply here (N1 expiry, N3 ref resolution, N4 bind policy when present).
""")
structure NbcPortSpec {
    /// Client placeholder; persistence assigns the canonical **`cfd.obp#Port.id`**.
    id: String
    type: String
    /// Counterparty-facing affordance copy (maps to **`cfd.obp#Port.promise`**).
    @default("")
    promise: String
    /// Minimum ledger sequence at which this port is no longer bindable. **`0`** means unset (NBC layer skips N1 expiry for this port).
    expires_seq: Long
    /// When non-empty object, **`bind_payload`** on bind MUST satisfy this policy (N4); validated by NBC bind-policy schema.
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
    /// Acting party's extending offer for this turn (maps to **`ExtendOffer`**).
    offer: Offer
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

Normative graph + persistence operations remain **`cfd.obp#ObpPersistence`**. Live transcript rules remain **`cfd.obp.frame#NegotiationFrameProtocol`**. This service groups NBC-specific wire shapes (`NbcTurnBody`, `NbcPortSpec`) used by bilateral deployments.
""")
service NbcNegotiationProtocol {
    version: "2026-05-14"
    operations: []
}
