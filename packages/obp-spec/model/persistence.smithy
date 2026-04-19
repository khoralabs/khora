$version: "2"

namespace cfd.obp

use smithy.api#Unit

@documentation("""
**Offer Binding Protocol — persistence surface (storage-agnostic RPC shapes).**

**Protocol overview**
OBP is a small typed graph for causal interaction history: **Party** → **Offer** → **Port**, with edges **EXTENDS** (issuer), **EXPOSES** (makes an affordance available), and **BINDS** (consumes an affordance). See `cfd.obp` shapes in `shapes.smithy`.

**Normative invariants** (implementations MUST enforce; not expressible in Smithy types alone)
1. Each **Offer** has exactly one **EXTENDS** from its issuing **Party** (created via **ExtendOffer**).
2. **BindPort** / bind leg of **ExtendOffer** may target only **Ports** that are the target of at least one **EXPOSES** (the port is *exposed* on the graph).
3. Reject binds when the binding **Offer** or target **Port** is expired (`ts_expired` vs implementor clock).
4. **BINDS** count toward a **Port** must not exceed that port's `max_bindings` (after resolving `ref`, count against the resolved exposed port).
5. **Port.ref:** resolve before bind rules; detect cycles on the ref chain and reject.
6. **Port.terminal** is an agent hint only; it does not change bind rules.

**Provenance:** optional **sourcemaps** on entities and edges reference `@cfd/memories` (`memory_id`, `source_key`).

**Staging:** ports that must not be bindable yet are **not** EXPOSES'd (no separate lifecycle enum on **Port**).

**Errors:** Operations model **success** shapes only. Implementations may throw or map failures for: not found, expired, not exposed, max bindings exceeded, ref cycle, invalid graph.

**Transactions:** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where the backend supports transactions.

Narrative: `packages/obp/README.md`, `packages/obp/documentation/*.obp`.
""")
service ObpPersistence {
    version: "2026-04-17"
    operations: [
        RegisterParty
        GetParty
        GetOffer
        GetPort
        ExtendOffer
        ExposePort
        BindPort
    ]
}

/// Create a party; implementation assigns `Party.id` and `Party.ts_created`.
operation RegisterParty {
    input: RegisterPartyInput
    output: RegisterPartyOutput
}

structure RegisterPartyInput {
    name: String
    /// Empty list means no memories provenance links.
    sourcemaps: SourceMapRefList
}

structure RegisterPartyOutput {
    party: Party
}

/// Resolve a party by id.
operation GetParty {
    input: GetPartyInput
    output: GetPartyOutput
}

structure GetPartyInput {
    id: String
}

structure GetPartyOutput {
    result: GetPartyResult
}

union GetPartyResult {
    notFound: Unit
    party: Party
}

operation GetOffer {
    input: GetOfferInput
    output: GetOfferOutput
}

structure GetOfferInput {
    id: String
}

structure GetOfferOutput {
    result: GetOfferResult
}

union GetOfferResult {
    notFound: Unit
    offer: Offer
}

operation GetPort {
    input: GetPortInput
    output: GetPortOutput
}

structure GetPortInput {
    id: String
}

structure GetPortOutput {
    result: GetPortResult
}

union GetPortResult {
    notFound: Unit
    port: Port
}

/// Create an offer, add Party -[EXTENDS]-> Offer, and optionally Offer -[BINDS]-> Port.
/// Implementations MUST assign `Offer.id` and `Offer.ts_created` and MAY ignore client-supplied `id`/`ts_created` on the input `offer` if they require placeholders in the wire format.
operation ExtendOffer {
    input: ExtendOfferInput
    output: ExtendOfferOutput
}

structure ExtendOfferInput {
    partyId: String
    offer: Offer
    /// When empty, no BINDS edge is created.
    @default("")
    bindPortId: String
}

structure ExtendOfferOutput {
    offer: Offer
}

/// Create a port and Offer -[EXPOSES]-> Port. Implementation assigns `Port.id` and `Port.ts_created`; may ignore placeholders on input `port`.
operation ExposePort {
    input: ExposePortInput
    output: ExposePortOutput
}

structure ExposePortInput {
    offerId: String
    port: Port
}

structure ExposePortOutput {
    port: Port
}

/// Offer -[BINDS]-> Port only (offer and port must satisfy invariants).
operation BindPort {
    input: BindPortInput
    output: BindPortOutput
}

structure BindPortInput {
    offerId: String
    portId: String
}

structure BindPortOutput {}
