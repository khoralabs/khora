$version: "2"

namespace cfd.obp

use smithy.api#Document
use smithy.api#Unit

@documentation("""
**Offer Binding Protocol — persistence surface (storage-agnostic RPC shapes).**

**Protocol overview**
OBP is a small typed graph for causal interaction history: **Party** → **Offer** → **Port**, with edges **EXTENDS** (issuer), **EXPOSES** (makes an affordance available), and **BINDS** (consumes an affordance). See `cfd.obp` shapes in `packages/obp/v2/model/spec/model/shapes.smithy`.

**Layering: OBP vs Negotiated Binding Convention (NBC)**
Some rules that reference implementations historically treated as “OBP persistence” are **not** universal OBP; they belong to the **Negotiated Binding Convention** (`cfd.obp.nbc`, `packages/obp/v2/nbc/spec/model/negotiated-binding-convention.smithy`, `packages/obp/documentation/negotiated-binding-convention.md`). **OBP-conformant** persistence MAY omit NBC bind-admissibility enforcement. **NBC-conformant** deployments MUST satisfy NBC in addition to OBP graph rules.

**OBP normative invariants (graph / projection)** — implementations MUST enforce for any `ObpPersistence` that faithfully projects the negotiation graph (not expressible in Smithy types alone):
1. Each **Offer** has exactly one **EXTENDS** from its issuing **Party** (created via **ExtendOffer**).
2. **BindPort** / bind leg of **ExtendOffer** may target only **Ports** that are the target of at least one **EXPOSES** (the port is *exposed* on the graph). *(Graph reachability only; NBC adds ledger, caps, **`terminal`** / policy context, and bind-admissibility on top.)*
3. **Port.ref:** resolve for graph integrity; detect cycles on the ref chain and reject invalid projections (see also NBC **N3** when enforcing caps at bind time).
4. **Party `name`** on **RegisterParty** MUST be non-empty after trim (TS **`OBPPersistenceClient`**).

**NBC (separate spec)** — bind admissibility, ledger/expiry at bind, canonical **`NbcPortExposePolicy.max_bindings`** tally, **`NbcPortExposePolicy.terminal`**, **`NbcPortExposePolicy`** bind/TTL fields, **`NbcBindSatisfaction`**, concurrent cap atomicity, and related orchestration: see **`cfd.obp.nbc#NegotiatedBindingConvention`**, **`cfd.obp.nbc#NbcPortExposePolicy`**, and narrative doc above. OBP’s prior numbered items **3–4, 7, 9–11** (ledger/expiry, `max_bindings` tally, bind policy MUST, multi-EXPOSES cap behavior, concurrent atomicity, store-boundary cap rules) are **NBC** normative rules **N1–N7** there.

**Provenance:** optional **sourcemaps** on entities and edges (see `SourceMapRef` in `packages/obp/v2/model/spec/model/shapes.smithy`) — store-agnostic; a concrete adapter may map them to an external system (e.g. a document store’s ids).

**Staging:** ports that must not be bindable yet are **not** EXPOSES'd (no separate lifecycle enum on **Port**).

**Orchestration reads:** **IsPortExposed**, **ListBinds**, **GetPortsSnapshot**, and **GetExtendingPartyId** mirror the **`ObpPersistence`** strategy surface in `@khoralabs/obp-persistence-client` (same semantics as TS **`OBPPersistenceClient`** helpers). NBC drivers use these reads when evaluating NBC preconditions.

**Policy payloads:** **`cfd.obp#BindsEdge`** carries only graph identity and **`content_receipts`**. **`bind_payload`** / **`bind_policy_snapshot`** on **BindPort** / **ExtendOffer** inputs and **ListBinds** rows are **`Document`** on the **persistence** surface (storage projection), not part of the core graph shape; NBC defines **`NbcBindSatisfaction`** / **`NbcBindPolicyAuditSnapshot`** and validation rules (`packages/obp/v2/nbc/spec/model/nbc-policy.smithy`). **`max_bindings`**, **`terminal`**, bind-policy JSON, and TTL/expose context for ports live under **`cfd.obp.nbc#NbcPortExposePolicy`**.

**Errors:** Operations model **success** shapes only. Implementations may throw or map failures for: not found, not exposed, ref cycle, invalid graph; NBC-specific failures (expired, max bindings exceeded, bind-policy validation) are defined under NBC.

**Transactions:** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where the backend supports transactions. NBC **N6** requires atomic **`NbcPortExposePolicy.max_bindings`** enforcement when claiming NBC conformance.

**Smithy ↔ TS unions:** **GetPartyResult** / **GetOfferResult** / **GetPortResult** (`notFound` vs payload) correspond to TS `{ kind: "notFound" } | { kind: "found"; … }` (parity matrix in `@khoralabs/obp-core` README).

Narrative: `packages/obp/README.md`, `packages/obp/documentation/*.md`, `packages/obp/documentation/*.obp`.

**Decentralized session sync:** Normative protocol (checkpoints, Merkle tree, hashing, verification, fork semantics) is **`cfd.obp.session#NegotiationSessionProtocol`** in `packages/obp/v2/session/spec/model/session-protocol.smithy`. Non-normative reader guide: `packages/obp/documentation/decentralized-session.md`.

**Live negotiation frames:** Bilateral signed **Frame** DAG rules (transport-agnostic) are **`cfd.obp.frame#NegotiationFrameProtocol`** in `packages/obp/v2/frames/spec/model/frame-protocol.smithy`. The HTTP/2 reference binding is **`cfd.obp.frame.http2#Http2Binding`** in `packages/obp/v2/transport-http2/spec/model/frame-binding-http2.smithy`.
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
        GetNbcBindWindowForOffer
        GetNbcBindWindowForPort
        SetPortExpiredNow
        SetOfferExpiredNow
    ]
}

/// Create a party; implementation assigns **`Party.id`** and MAY record row **`created_seq`** per **`cfd.obp.nbc#NbcRowCommitMeta`** where adapters require it.
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
/// Implementations MUST assign **`Offer.id`** and MAY ignore client-supplied **`id`** on the input **`offer`** if they require placeholders in the wire format. Row **`created_seq`** for persisted rows follows **`cfd.obp.nbc#NbcRowCommitMeta`** when tracked.
operation ExtendOffer {
    input: ExtendOfferInput
    output: ExtendOfferOutput
}

structure ExtendOfferInput {
    partyId: String
    offer: Offer
    /// NBC N1 bind-window projection for this offer row — **not** part of **`cfd.obp#Offer`**. Persisted alongside the thin offer; **`0`** disables the corresponding mode.
    @default(0)
    nbc_expires_turn: Integer
    /// NBC N1 relay-time bind ceiling for this offer row — **not** part of **`cfd.obp#Offer`**. **`0`** disables relay mode.
    @default(0)
    nbc_expires_at_relay_ms: Long
    /// When empty, no BINDS edge is created.
    @default("")
    bindPortId: String
    /// Policy-shaped; NBC validates (**`cfd.obp.nbc#NbcBindSatisfaction`**); persisted on bind row, not on **`cfd.obp#BindsEdge`**.
    bind_payload: Document = null
}

structure ExtendOfferOutput {
    offer: Offer
}

/// Create a port and Offer -[EXPOSES]-> Port. Implementation assigns **`Port.id`**; may ignore placeholders on input **`port`**. Row **`created_seq`** follows **`cfd.obp.nbc#NbcRowCommitMeta`** when tracked.
operation ExposePort {
    input: ExposePortInput
    output: ExposePortOutput
}

structure ExposePortInput {
    offerId: String
    port: Port
    /// NBC N1 bind-window projection for this new port row — **not** part of **`cfd.obp#Port`**. **`0`** disables the corresponding mode.
    @default(0)
    nbc_expires_turn: Integer
    /// NBC N1 relay-time bind ceiling — **not** on **`cfd.obp#Port`**. **`0`** disables relay mode.
    @default(0)
    nbc_expires_at_relay_ms: Long
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
    /// Policy-shaped; NBC validates (**`cfd.obp.nbc#NbcBindSatisfaction`**); persisted on bind row, not on **`cfd.obp#BindsEdge`**.
    bind_payload: Document = null
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

/// All **BINDS** rows for capacity / ref resolution (`ObpPersistence.listBinds`). **`bind_payload`** / **`bind_policy_snapshot`** are listing projection fields (see **`BindListingRow`**), not **`cfd.obp#BindsEdge`** members.
operation ListBinds {
    input: ListBindsInput
    output: ListBindsOutput
}

structure ListBindsInput {}

structure BindListingRow {
    offerId: String
    portId: String
    content_receipts: ContentAddressedSourceRefList
    /// Policy-shaped satisfaction persisted with bind listing; not on **`cfd.obp#BindsEdge`**.
    bind_payload: Document = null
    /// Policy-shaped audit (**`cfd.obp.nbc#NbcBindPolicyAuditSnapshot`**); not on **`cfd.obp#BindsEdge`**.
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

/// Read NBC N1 bind-window projection for an offer row (**`nbc_expires_*`**), not part of thin **`cfd.obp#Offer`**.
operation GetNbcBindWindowForOffer {
    input: GetNbcBindWindowForOfferInput
    output: GetNbcBindWindowForOfferOutput
}

structure GetNbcBindWindowForOfferInput {
    offerId: String
}

structure NbcBindWindowProjection {
    nbc_expires_turn: Integer
    nbc_expires_at_relay_ms: Long
}

union GetNbcBindWindowResult {
    notFound: Unit
    window: NbcBindWindowProjection
}

structure GetNbcBindWindowForOfferOutput {
    result: GetNbcBindWindowResult
}

/// Read NBC N1 bind-window projection for a port row (**`nbc_expires_*`**), not part of thin **`cfd.obp#Port`**.
operation GetNbcBindWindowForPort {
    input: GetNbcBindWindowForPortInput
    output: GetNbcBindWindowForPortOutput
}

structure GetNbcBindWindowForPortInput {
    portId: String
}

structure GetNbcBindWindowForPortOutput {
    result: GetNbcBindWindowResult
}

/// Set NBC bind-window projection columns on the port row (**`nbc_expires_*`**) so N1 rejects new binds. Caller enforces issuer policy. Does **not** mutate thin **`cfd.obp#Port`** shape fields (none carry expiry).
operation SetPortExpiredNow {
    input: SetPortExpiredNowInput
    output: SetPortExpiredNowOutput
}

structure SetPortExpiredNowInput {
    portId: String
}

structure SetPortExpiredNowOutput {}

/// Set NBC bind-window projection columns on the offer row and on ports exposed from that offer so N1 rejects new binds. Caller enforces issuer policy. Does **not** mutate **`cfd.obp#Offer`** / **`cfd.obp#Port`** core shapes.
operation SetOfferExpiredNow {
    input: SetOfferExpiredNowInput
    output: SetOfferExpiredNowOutput
}

structure SetOfferExpiredNowInput {
    offerId: String
}

structure SetOfferExpiredNowOutput {}
