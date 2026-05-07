$version: "2"

namespace cfd.obp.frame

use smithy.api#Document

/// Lowercase hex encoding of a 32-byte digest (**no** `0x` prefix), length **64**.
@pattern("^[0-9a-f]{64}$")
string Sha256HexLower

enum FrameType {
    PROLIFERATE
    RESOLVE
    TERMINATE
}

/// Content-addressed receipt (aligned with `cfd.obp#ContentAddressedSourceRef` shape; duplicated here so `cfd.obp.frame` stays independent of `cfd.obp` imports).
structure ContentReceipt {
    resource_id: String
    source_key: String
    content_sha256_hex: Sha256HexLower
}

list ContentReceiptList {
    member: ContentReceipt
}

list PortSpecList {
    member: PortSpec
}

/// One exposed affordance on an offer. `bind_policy` / `ttl` use JSON **Document**; **null** means unset (see service docs).
/// **`max_bindings`** is projected to **`cfd.obp#Port.max_bindings`** (canonical bind tally). Omitted on wire means **1**.
structure PortSpec {
    id: String
    isTerminal: Boolean
    /// Maximum successful binds against this port (after **`ref`** resolution to canonical id). Default **1** when omitted.
    max_bindings: Integer = 1
    bind_policy: Document
    ttl: Document
}

/// Phase I — proliferate: create/extend an offer and declare exposed ports (payload for **PROLIFERATE** `Frame.body`).
structure ProliferateBody {
    offerId: String
    ports: PortSpecList
}

/// Phase II — resolve: bind exactly one port on a proliferated offer (payload for **RESOLVE** `Frame.body`).
structure ResolveBody {
    offerId: String
    portId: String
    payload: Document
    content_receipts: ContentReceiptList
}

/// Session teardown (payload for **TERMINATE** `Frame.body`).
structure TerminateBody {
    reason: String
    /// Optional machine-readable sub-code for telemetry.
    code: String
}

list PartyIdList {
    member: String
}

list ActorPubkeyList {
    member: String
}

/// Negotiation partition + bootstrapping hash. The first **Frame** in a session **MUST** use `p_hash == genesis_hash`.
structure SessionInit {
    session_id: String
    /// Exactly two opaque party ids (e.g. UUIDs), order is local-to-both-peers agreement.
    party_ids: PartyIdList
    /// Two lowercase-hex encoded public keys aligned with **`party_ids`** (`[responder, initiator]` for the HTTP/2 binding).
    actor_pubkeys: ActorPubkeyList
    genesis_hash: Sha256HexLower
}

/// Atomic signed unit on the bilateral negotiation DAG.
structure Frame {
    /// Predecessor digest (`Sha256` over **canonical JSON bytes** of the prior complete **Frame** including `sig`); **`SessionInit.genesis_hash`** for the first frame.
    p_hash: Sha256HexLower
    /// Sender identity (public key encoding is binding-specific; reference HTTP/2 binding uses lowercase hex of the raw public key).
    actor: String
    /// Signature over **`signing_bytes`** (see **NegotiationFrameProtocol**); encoding is binding-specific.
    sig: String
    type: FrameType
    /// Discriminated by **`type`**: embed **`ProliferateBody`**, **`ResolveBody`**, or **`TerminateBody`** as JSON object matching those structures.
    body: Document
}

@documentation("""
**OBP/1.0 — bilateral frame protocol (transport-agnostic).**

This namespace models the **Frame** DAG from the human-readable draft (`packages/obp/.idea/draft.md`): causal integrity,
alternating proliferation / resolution, signed actors, and logic-blind structural enforcement.

**Relationship to persistence:** Valid **PROLIFERATE** / **RESOLVE** transitions **MUST** be projected to **`cfd.obp#ObpPersistence`**
via **`OBPPersistenceClient`** (or equivalent) so graph invariants in `persistence.smithy` hold. **TERMINATE** ends the frame session; it does
not alone mutate **`ObpPersistence`** unless implementations map it to optional revoke ops.

**Canonical JSON:** For any value **`v`**, implementations compute UTF-8 bytes of JSON with **recursively sorted object keys**;
arrays preserve order; **`null`**, booleans, numbers, and strings follow **`JSON.stringify`**. Call that **`canonical_json(v)`**.

**Signing input (`signing_bytes`):** Let **`signing_payload`** be the **`Frame`** object with the **`sig`** field omitted (or set to the
empty string). **`signing_bytes = UTF-8(canonical_json(signing_payload))`**. Implementations **MUST** verify **`sig`** over
 **`signing_bytes`** before accepting a frame.

**Post-frame state hash (tip):** After a frame is accepted, the local tip is **`tip = SHA-256( UTF-8(canonical_json(frame_complete)) )`**
where **`frame_complete`** is the full **Frame** including **`sig`**, with the same canonical JSON rules. The next frame's **`p_hash`**
**MUST** equal this **`tip`** (hex‑encoded **64** lowercase).

**Normative on‑wire framing (default):** Over any duplex byte stream, frames **MUST** be encoded as **`uint32_be(length)`** immediately
followed by **`length`** bytes of **`UTF-8(canonical_json(frameObject))`**, where **`frameObject`** is either an **`init`** envelope
(see below) or a **Frame**. Alternative bindings **MAY** substitute an equivalent framing that preserves strict ordering and message
boundaries; see **`cfd.obp.frame.http2`**.

**Session bootstrap:** The first framed JSON object **SHOULD** be **`{ "init": `<SessionInit JSON>` }`** where **`SessionInit`** carries
**`party_ids`**, **`actor_pubkeys`** (aligned order), and **`genesis_hash`**. Keys SHOULD be sorted for canonical framing. All subsequent framed objects **MUST** be **Frame** objects **`{ "actor", "body", "p_hash", "sig", "type" }`**.

**Turn contract (informal):** After **init**, peers alternate **PROLIFERATE** (expose ports on an offer) and **RESOLVE** (bind exactly
one offered port). **TERMINATE** may be sent when allowed by local policy. Implementations **MUST** reject frames that violate the
agreed actor order, wrong **offerId** on **RESOLVE**, or unknown **portId** for the open offer.

**Hardened constraints (draft §8):**
1. **Strict ordering:** reject when **`p_hash`** ≠ local tip.
2. **Identity verification:** reject invalid **`sig`**; session **SHOULD** abort.
3. **Offer/port expiry / capacity:** **`OBPPersistenceClient`** / ledger **`expires_seq`** rejects stale **RESOLVE** per **`cfd.obp`**. **`PortSpec.max_bindings`**
   sets **`Port.max_bindings`** on expose (default **1** when omitted). Optional TTL on ports follows **`Port.ttl_*` fields once projected from **`PortSpec.ttl`**.
4. **No partial binds:** **RESOLVE** either commits a full **BINDS** satisfaction payload or fails.

**Mapping to decentralized session sync:** Each accepted frame yields one or more replayable **`cfd.obp.session#SessionOp`** values
(extend offer, expose port, bind-via-extend, optional terminal marker) for **`NegotiationSessionProtocol`** checkpoints.

**Concurrent transport sessions:** Servers **MAY** accept **many** open streams at once (one negotiated stream per client session). **How** each logical bilateral session is backed—dedicated **`ObpPersistence`**, a shared store with partitioning, or otherwise—is **implementation-defined**; this protocol **MUST NOT** be read as requiring per-session physical isolation. **RESOLVE** and **PROLIFERATE** projections **MUST** satisfy **`cfd.obp#ObpPersistence`** invariants in `persistence.smithy` on whatever store they use, including **global canonical `max_bindings`** and **atomic** enforcement when concurrent operations mutate the **same** logical graph (see invariant **11** in `persistence.smithy` for shared vs separate store boundaries).

**Explicit non-goals here:** hostnames, ports, TLS, and URLs — see transport bindings (e.g. **`cfd.obp.frame.http2`**).
""")
service NegotiationFrameProtocol {
    version: "2026-05-05"
    operations: []
}
