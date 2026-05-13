$version: "2"

namespace cfd.obp

use smithy.api#Document
use smithy.api#Unit

@documentation("""
**Offer Binding Protocol — persistence surface (storage-agnostic RPC shapes).**

**Protocol overview**
OBP is a small typed graph for causal interaction history: **Party** → **Offer** → **Port**, with edges **EXTENDS** (issuer), **EXPOSES** (makes an affordance available), and **BINDS** (consumes an affordance). See `cfd.obp` shapes in `shapes.smithy`.

**Layering: OBP vs Negotiated Binding Convention (NBC)**
Some rules that reference implementations historically treated as “OBP persistence” are **not** universal OBP; they belong to the **Negotiated Binding Convention** (`cfd.obp.nbc`, `negotiated-binding-convention.smithy`, `packages/obp/documentation/negotiated-binding-convention.md`). **OBP-conformant** persistence MAY omit NBC bind-admissibility enforcement. **NBC-conformant** deployments MUST satisfy NBC in addition to OBP graph rules.

**OBP normative invariants (graph / projection)** — implementations MUST enforce for any `ObpPersistence` that faithfully projects the negotiation graph (not expressible in Smithy types alone):
1. Each **Offer** has exactly one **EXTENDS** from its issuing **Party** (created via **ExtendOffer**).
2. **BindPort** / bind leg of **ExtendOffer** may target only **Ports** that are the target of at least one **EXPOSES** (the port is *exposed* on the graph). *(Graph reachability only; NBC adds ledger, caps, and policy rules on top.)*
3. **Port.ref:** resolve for graph integrity; detect cycles on the ref chain and reject invalid projections (see also NBC **N3** when enforcing caps at bind time).
4. **Port.terminal** is an agent hint only; it does not change OBP graph projection rules.
5. **Party `name`** on **RegisterParty** MUST be non-empty after trim (TS **`OBPPersistenceClient`**).

**NBC (separate spec)** — bind admissibility, ledger/expiry at bind, canonical **`max_bindings`**, **`bind_policy`** / **`counterparty_bind`**, concurrent cap atomicity, and related orchestration: see **`cfd.obp.nbc#NegotiatedBindingConvention`** and narrative doc above. OBP’s prior numbered items **3–4, 7, 9–11** (ledger/expiry, `max_bindings` tally, bind policy MUST, multi-EXPOSES cap behavior, concurrent atomicity, store-boundary cap rules) are **NBC** normative rules **N1–N7** there.

**Provenance:** optional **sourcemaps** on entities and edges (see `SourceMapRef` in `shapes.smithy`) — store-agnostic; a concrete adapter may map them to an external system (e.g. a document store’s ids).

**Staging:** ports that must not be bindable yet are **not** EXPOSES'd (no separate lifecycle enum on **Port**).

**Orchestration reads:** **IsPortExposed**, **ListBinds**, **GetPortsSnapshot**, and **GetExtendingPartyId** mirror the **`ObpPersistence`** strategy surface in `@khoralabs/obp-persistence-client` (same semantics as TS **`OBPPersistenceClient`** helpers). NBC drivers use these reads when evaluating NBC preconditions.

**Errors:** Operations model **success** shapes only. Implementations may throw or map failures for: not found, not exposed, ref cycle, invalid graph; NBC-specific failures (expired, max bindings exceeded, bind-policy validation) are defined under NBC.

**Transactions:** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where the backend supports transactions. NBC **N6** requires atomic **`max_bindings`** enforcement when claiming NBC conformance.

**Smithy ↔ TS unions:** **GetPartyResult** / **GetOfferResult** / **GetPortResult** (`notFound` vs payload) correspond to TS `{ kind: "notFound" } | { kind: "found"; … }` (parity matrix in `@khoralabs/obp-core` README).

**Structured bind_policy:** Smithy uses **`Document`** on **Port**; constrained JSON shape for policy fields is described under NBC and validated in reference TS via Zod (`PortBindPolicy`).

Narrative: `packages/obp/README.md`, `packages/obp/documentation/*.md`, `packages/obp/documentation/*.obp`.

**Decentralized session sync:** Normative protocol (checkpoints, Merkle tree, hashing, verification, fork semantics) is **`cfd.obp.session#NegotiationSessionProtocol`** in `packages/obp/persistence/spec/model/session-protocol.smithy`. Non-normative reader guide: `packages/obp/documentation/decentralized-session.md`.

**Live negotiation frames:** Bilateral signed **Frame** DAG rules (transport-agnostic) are **`cfd.obp.frame#NegotiationFrameProtocol`** in `packages/obp/persistence/spec/model/frame-protocol.smithy`. The HTTP/2 reference binding is **`cfd.obp.frame.http2#Http2Binding`** in `packages/obp/persistence/spec/model/frame-binding-http2.smithy`.
""")
service ObpPersistence {
    version: "2026-05-01"
    operations: [
        RegisterParty
        GetParty
        GetOffer
        GetPort
        ExtendOffer
        ExposePort
        BindPort
        ListExposedPortEdges
        IsPortExposed
        ListBinds
        GetPortsSnapshot
        GetExtendingPartyId
        SetPortExpiredNow
        SetOfferExpiredNow
    ]
}

/// Create a party; implementation assigns `Party.id` and `Party.created_seq`.
operation RegisterParty {
    input: RegisterPartyInput
    output: RegisterPartyOutput
}

structure RegisterPartyInput {
    name: String
    /// Empty list means no source-map provenance links.
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
/// Implementations MUST assign `Offer.id` and `Offer.created_seq` and MAY ignore client-supplied `id`/`created_seq` on the input `offer` if they require placeholders in the wire format.
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
    /// Satisfaction payload when binding; MUST satisfy target port `bind_policy` when set; null when absent.
    counterparty_bind: Document = null
}

structure ExtendOfferOutput {
    offer: Offer
}

/// Create a port and Offer -[EXPOSES]-> Port. Implementation assigns `Port.id` and `Port.created_seq`; may ignore placeholders on input `port`.
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
    /// Satisfaction payload; MUST satisfy target port `bind_policy` when set; null when absent.
    counterparty_bind: Document = null
}

structure BindPortOutput {}

/// Read all Offer–Port **EXPOSES** edges for enumeration (orchestration helpers).
operation ListExposedPortEdges {
    input: ListExposedPortEdgesInput
    output: ListExposedPortEdgesOutput
}

structure ListExposedPortEdgesInput {}

structure ExposedPortEdge {
    offerId: String
    portId: String
}

structure ListExposedPortEdgesOutput {
    edges: ExposedPortEdgeList
}

list ExposedPortEdgeList {
    member: ExposedPortEdge
}

/// True iff some **EXPOSES** edge targets this port id (`ObpPersistence.isPortExposed`).
operation IsPortExposed {
    input: IsPortExposedInput
    output: IsPortExposedOutput
}

structure IsPortExposedInput {
    portId: String
}

structure IsPortExposedOutput {
    exposed: Boolean
}

/// All **BINDS** rows for capacity / ref resolution (`ObpPersistence.listBinds`). **`bind_policy_snapshot`** corresponds to TS **`bind_policy`** on listing rows.
operation ListBinds {
    input: ListBindsInput
    output: ListBindsOutput
}

structure ListBindsInput {}

structure BindListingRow {
    offerId: String
    portId: String
    content_receipts: ContentAddressedSourceRefList
    counterparty_bind: Document = null
    /// TS **`bind_policy`** field at bind time (audit).
    bind_policy_snapshot: Document = null
}

list BindListingRowList {
    member: BindListingRow
}

structure ListBindsOutput {
    binds: BindListingRowList
}

/// Snapshot of all ports keyed by id (`ObpPersistence.getPortsSnapshot`).
operation GetPortsSnapshot {
    input: GetPortsSnapshotInput
    output: GetPortsSnapshotOutput
}

structure GetPortsSnapshotInput {}

structure PortSnapshotEntry {
    portId: String
    port: Port
}

list PortSnapshotEntryList {
    member: PortSnapshotEntry
}

structure GetPortsSnapshotOutput {
    entries: PortSnapshotEntryList
}

/// Party id on **EXTENDS** for this offer, or empty string when unknown (`ObpPersistence.getExtendingPartyId` uses **null** in TS — map empty ↔ null in adapters).
operation GetExtendingPartyId {
    input: GetExtendingPartyIdInput
    output: GetExtendingPartyIdOutput
}

structure GetExtendingPartyIdInput {
    offerId: String
}

structure GetExtendingPartyIdOutput {
    /// Empty when no EXTENDS edge exists for this offer (TS **`null`**).
    @default("")
    partyId: String
}

/// Set `Port.expires_seq` to the current revoke ledger sequence. Caller enforces issuer policy.
operation SetPortExpiredNow {
    input: SetPortExpiredNowInput
    output: SetPortExpiredNowOutput
}

structure SetPortExpiredNowInput {
    portId: String
}

structure SetPortExpiredNowOutput {}

/// Set `Offer.expires_seq` to the current revoke ledger sequence and cascade to ports exposed on that offer. Caller enforces issuer policy.
operation SetOfferExpiredNow {
    input: SetOfferExpiredNowInput
    output: SetOfferExpiredNowOutput
}

structure SetOfferExpiredNowInput {
    offerId: String
}

structure SetOfferExpiredNowOutput {}
