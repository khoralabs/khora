$version: "2"

namespace cfd.obp

use smithy.api#Document
use smithy.api#Unit

@documentation("""
**Offer Binding Protocol — persistence surface (storage-agnostic RPC shapes).**

**Protocol overview**
OBP is a small typed graph for causal interaction history: **Party** → **Offer** → **Port**, with edges **EXTENDS** (issuer), **EXPOSES** (makes an affordance available), and **BINDS** (consumes an affordance). See `cfd.obp` shapes in `shapes.smithy`.

**Normative invariants** (implementations MUST enforce; not expressible in Smithy types alone)
1. Each **Offer** has exactly one **EXTENDS** from its issuing **Party** (created via **ExtendOffer**).
2. **BindPort** / bind leg of **ExtendOffer** may target only **Ports** that are the target of at least one **EXPOSES** (the port is *exposed* on the graph).
3. Reject binds when the binding **Offer** or target **Port** is expired: current **`ledger_seq`** MUST satisfy **`ledger_seq < expires_seq`** on both (see `shapes.smithy` **`Offer`** / **`Port`**). Implementations derive **`ledger_seq`** from session control—not wall-clock `Date.now()`—unless an adapter explicitly maps clock ticks to sequence (discouraged).
4. **BINDS** count toward a **Port** must not exceed that port's `max_bindings` (after resolving `ref`, count against the resolved exposed port).
5. **Port.ref:** resolve before bind rules; detect cycles on the ref chain and reject.
6. **Port.terminal** is an agent hint only; it does not change bind rules.
7. **Bind policy:** **Port** may carry **`bind_policy`** (`Document`) declaring constraint metadata. When present and non-empty per implementation rules, **BindPort** / bind leg of **ExtendOffer** MUST supply **`counterparty_bind`** satisfaction data validated against that policy before committing the **BINDS** edge; validated payload is stored on **`BindsEdge.counterparty_bind`** (see `shapes.smithy`). **`bind_policy_snapshot`** on the edge is an optional audit copy of the policy used at bind time.
8. **Party `name`** on **RegisterParty** MUST be non-empty after trim (TS **`ObpClient`**).

**Provenance:** optional **sourcemaps** on entities and edges (see `SourceMapRef` in `shapes.smithy`) — store-agnostic; a concrete adapter may map them to an external system (e.g. a document store’s ids).

**Staging:** ports that must not be bindable yet are **not** EXPOSES'd (no separate lifecycle enum on **Port**).

**Revocation (soft close):** implementations MAY support setting **`expires_seq`** on **Port** / **Offer** to the **current ledger sequence** so subsequent binds fail the expiry check. **ListExposedPortEdges** supports enumerating EXPOSES for orchestration (e.g. dynamic tools).

**Orchestration reads:** **IsPortExposed**, **ListBinds**, **GetPortsSnapshot**, and **GetExtendingPartyId** mirror the **`ObpPersistence`** strategy surface in `@cfd/obp-core` (same semantics as TS **`ObpClient`** precondition helpers).

**Errors:** Operations model **success** shapes only. Implementations may throw or map failures for: not found, expired, not exposed, max bindings exceeded, ref cycle, invalid graph, bind-policy validation failure.

**Transactions:** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where the backend supports transactions.

**Smithy ↔ TS unions:** **GetPartyResult** / **GetOfferResult** / **GetPortResult** (`notFound` vs payload) correspond to TS `{ kind: "notFound" } | { kind: "found"; … }` (parity matrix in `@cfd/obp-core` README).

**Structured bind_policy:** Smithy uses **`Document`**; constrained JSON shape is validated in TS via Zod (`PortBindPolicy`).

Narrative: `packages/obp/README.md`, `packages/obp/documentation/*.md`, `packages/obp/documentation/*.obp`.

**Decentralized session sync:** Normative protocol (checkpoints, Merkle tree, hashing, verification, fork semantics) is **`cfd.obp.session#NegotiationSessionProtocol`** in `packages/obp/spec/model/session-protocol.smithy`. Non-normative reader guide: `packages/obp/documentation/decentralized-session.md`.
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
