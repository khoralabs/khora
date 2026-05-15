$version: "2"

namespace cfd.obp.frame

use smithy.api#Document

/// Lowercase hex encoding of a 32-byte digest (**no** `0x` prefix), length **64**.
@pattern("^[0-9a-f]{64}$")
string Sha256HexLower

enum FrameType {
    TURN
    /// Actor commits to **no further TURN frames** that extend new offers on this chain; **`body`** remains opaque at this layer.
    /// Unlike **TERMINATE**, this frame **participates in the DAG** (`p_hash` chain and signing rules identical to **TURN**). Implementations **MUST** advance the local tip after acceptance. It does **not** by itself close the byte stream or require persistence mutation unless a higher layer maps it (e.g. NBC “no more offers” bookkeeping).
    END_OFFERS
    TERMINATE
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
    /// Exactly two opaque party ids (e.g. UUIDs). **`party_ids[i]`** corresponds to **`actor_pubkeys[i]`**.
    /// **`actor_pubkeys`** MUST be sorted in ascending lexicographic order (binary comparison on lowercase hex strings).
    party_ids: PartyIdList
    /// Two lowercase-hex encoded public keys aligned index-wise with **`party_ids`** (canonical ascending order).
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
    /// Opaque JSON payload for this frame type. **`cfd.obp`** does not normatively define keys or nested shapes for **TURN** / **END_OFFERS** / **TERMINATE** bodies.
    /// NBC-conformant deployments interpret **TURN** bodies per **`cfd.obp.nbc`** and project to **`cfd.obp#ObpPersistence`**; **END_OFFERS** carries no required persistence projection here. OBP-only implementations MAY use a private wire profile.
    body: Document
}

@documentation("""
**OBP/1.0 — bilateral frame protocol (transport-agnostic).**

This namespace models the **Frame** DAG: causal integrity, signed actors, and **opaque** turn payloads. Graph vocabulary (**Party**, **Offer**, **Port**, edges) lives in **`cfd.obp`**; **when** a bind is allowed and how policy JSON is validated lives in **`cfd.obp.nbc`**.

**Layering:** Verify **`Frame`** signatures and **`p_hash`** chain first. Then (**NBC path**) validate opaque **`body`** against NBC rules and **`NbcPortExposePolicy`**. Finally project accepted effects to **`cfd.obp#ObpPersistence`**. OBP-only stacks MAY skip NBC and use a documented private mapping from **`body`** to persistence ops.

**Relationship to persistence:** Accepted **TURN** effects **MUST** be projected to **`cfd.obp#ObpPersistence`**
via **`OBPPersistenceClient`** (or equivalent) so graph invariants in `packages/obp/v2/persistence/spec/model/persistence.smithy` hold. **END_OFFERS** is a signed DAG step with **no** normative **`ObpPersistence`** projection in **`cfd.obp`** — peers use it to record mutual visibility that an actor will not issue further offer-extending **TURN**s on this chain (bilateral coordination); optional local policy may still allow **TERMINATE** or stream teardown later. **TERMINATE** ends the frame session; it does
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

**Session bootstrap:** Framed objects **MAY** include multiple **`{ "init": `<SessionInit JSON>` }`** envelopes on the **same** duplex byte stream (long‑lived multiplex): each distinct **`session_id`** / **`genesis_hash`** pair starts a separate causal chain. Implementations **MUST** route each **Frame** to the unique open chain whose current tip or registered **`genesis_hash`** equals **`p_hash`**. Keys SHOULD be sorted for canonical framing. Between **`init`** messages, **hub-mediated** deployments that adopt the **agent relay policy** **MUST** frame payloads as **`cfd.agent.relay#RelayEnvelope`** (`frame` + `relay_ts_ms`); that policy is **not** part of core **`cfd.obp.frame`** — see `packages/agent/relay/spec/model/frame-relay-binding.smithy`. Direct streams **without** a relay **MAY** send bare **`Frame`** objects.

**Relay echo (when relay policy applies):** Originators MUST apply **`Frame`** effects only from **`cfd.agent.relay#RelayEnvelope`** bytes received back from the relay (including self-echo), not from the pre-relay send path, so **`relay_ts_ms`** and DAG advance stay consistent with the counterparty.

**Turn contract (informal):** After **init**, any actor may send a **TURN** frame. Semantics of **`body`** (extend offer, expose ports, bind) are **not** defined here — see **`cfd.obp.nbc`** and **`cfd.obp#ObpPersistence`**. Causal order is enforced only by **`p_hash`**: each frame's **`p_hash`** MUST equal the local DAG tip (**`CAUSAL_MISMATCH`** otherwise). The wire protocol does **not** imply strict alternation between parties — that is **transport-scoped**. Purely decentralized transports **MAY** embed alternation hints inside the opaque **`body`**.

**END_OFFERS:** Either party **MAY** send **`END_OFFERS`** instead of **TURN** on their move to advance the tip while signaling they will send **no further offers** (no further offer-extending **TURN**s) to the counterparty on this chain. Verifiers apply the same **`p_hash`** and signature rules as **TURN**. **`body`** is opaque; empty object is permitted.

**TERMINATE** may be sent when allowed by local policy; **`body`** remains opaque at this layer.

**Hardened constraints (draft §8):**
1. **Strict ordering:** reject when **`p_hash`** ≠ local tip.
2. **Identity verification:** reject invalid **`sig`**; session **SHOULD** abort.
3. **NBC bind-window / capacity:** after NBC (if any) admits a bind, the **`ObpPersistence`** NBC projection (**`nbc_expires_*`** columns / **`getNbcBindWindowFor*`** reads — not fields on thin **`cfd.obp#Offer`** / **`cfd.obp#Port`**) evaluated against **`turn_seq`** and **`relay_ts_ms`** from **`cfd.agent.relay#RelayEnvelope`** when hub relay policy is in use on the binding **TURN**, plus **`NbcPortExposePolicy.max_bindings`** (see **`cfd.obp.nbc`**), constrain the store.
4. **No partial binds:** NBC and persistence layers **MUST** reject partial bind projections; opaque **`body`** must not commit a half-applied **BINDS** edge.

**Mapping to decentralized session sync:** Each accepted frame yields one or more replayable **`cfd.obp.session#SessionOp`** values
for **`NegotiationSessionProtocol`** checkpoints; **`SessionOp.payload`** carries opaque replay material aligned with this **`body`** contract (**`kind`** **`turn`**, **`end_offers`**, **`terminate`**, …).

**Concurrent transport sessions:** Servers **MAY** accept **many** open streams at once (one negotiated stream per client session). **How** each logical bilateral session is backed—dedicated **`ObpPersistence`**, a shared store with partitioning, or otherwise—is **implementation-defined**; this protocol **MUST NOT** be read as requiring per-session physical isolation. Projections **MUST** satisfy **`cfd.obp#ObpPersistence`** invariants in `packages/obp/v2/persistence/spec/model/persistence.smithy` on whatever store they use, including NBC **global canonical `NbcPortExposePolicy.max_bindings`** and **atomic** enforcement when concurrent operations mutate the **same** logical graph (see invariant **11** in `packages/obp/v2/persistence/spec/model/persistence.smithy` for shared vs separate store boundaries).

**Explicit non-goals here:** hostnames, ports, TLS, and URLs — see transport bindings (e.g. **`cfd.obp.frame.http2`**).
""")
service NegotiationFrameProtocol {
    version: "2026-05-15"
    operations: []
}
