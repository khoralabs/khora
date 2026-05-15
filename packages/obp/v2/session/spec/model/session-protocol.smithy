$version: "2"

namespace cfd.obp.session

use smithy.api#Document

/// Lowercase hex encoding of a 32-byte SHA-256 digest (**no** `0x` prefix), length **64**.
@pattern("^[0-9a-f]{64}$")
string Sha256HexLower

/// Ordered ops appended in **`SessionEnvelope`** after **`base_checkpoint.seq`**.
list SessionOpList {
    member: SessionOp
}

/// Abstract operation in the session log. **`kind`** MUST name a replayable effect that implementations
/// map to **`cfd.obp#ObpPersistence`** operations (or their documented semantics) for the negotiation slice
/// both peers materialize. Frame-derived kinds include **`turn`** (symmetric negotiation move; payload typically carries
/// **`actor`** plus opaque **TURN** **`Frame.body`** per **`cfd.obp.frame`**), **`end_offers`** (**`END_OFFERS`** frame: actor signals no further offer-extending **TURN**s; payload typically carries **`actor`** plus opaque **`Frame.body`**; **no** normative **`ObpPersistence`** projection in **`cfd.obp`** unless a host profile extends it), and **`terminate`**. When multiple **`SessionInit`** chains share one transport,
/// ops **MAY** carry **`session_id`** (same string as that chain's **`SessionInit.session_id`**) so **`SessionEnvelope`** can
/// address the correct Merkle prefix. Receivers MUST apply **`delta_ops`** in order when verification succeeds.
/// **`payload`** is JSON-compatible; canonical hashing rules apply (see **`NegotiationSessionProtocol`** service docs).
structure SessionOp {
    kind: String
    payload: Document
    /// Present when ops from several negotiations are multiplexed on one stream; identifies which chain the op belongs to.
    session_id: String
}

/// Agreed prefix commitment: **`seq`** is the number of canonical operations covered (**`op_0 … op_{seq-1}`**);
/// **`root_hex`** is the Merkle root over those leaves (see **`NegotiationSessionProtocol`**).
structure Checkpoint {
    seq: Long
    root_hex: Sha256HexLower
}

/// Logical message between two peers for decentralized sync (transport-agnostic).
structure SessionEnvelope {
    session_id: String
    from_party: String
    base_checkpoint: Checkpoint
    delta_ops: SessionOpList
    new_checkpoint: Checkpoint
}

/// Verification failed: recomputed prefix length does not match **`claimed.seq`**.
structure SeqMismatchError {
    expected: Long
    actual: Long
}

/// Verification failed: Merkle root does not match **`claimed.root_hex`** after replay.
structure RootMismatchError {
    expected_hex: Sha256HexLower
    recomputed_hex: Sha256HexLower
}

/// Discriminated verification failure (pure logic; not an RPC fault shape).
union VerifyError {
    seqMismatch: SeqMismatchError
    rootMismatch: RootMismatchError
}

/// Normative documentation and wire shapes for **decentralized negotiation session sync** on top of core OBP.
///
/// **Conceptual dependency:** This namespace describes how two peers agree on an ordered operation log and Merkle checkpoints
/// while each runs **`cfd.obp#ObpPersistence`** locally. **`cfd.obp`** **`packages/obp/v2/model/spec/model/shapes.smithy`** / **`packages/obp/v2/persistence/spec/model/persistence.smithy`** MUST NOT
/// import **`cfd.obp.session`** (no compiler dependency from core OBP to this protocol).
///
/// **Session scope:** A negotiation session has **`session_id`** (opaque string) and exactly **two** participant party ids
/// (opaque strings, e.g. UUIDs). Complete history in protocol messages means the **ordered session log** both parties treat
/// as authoritative for this negotiation—not every entity in a global store. Implementations SHOULD restrict hashed ops to
/// in-session mutations when forming leaves.
///
/// **Expiry alignment (NBC):** Bind/expose validity uses NBC bind windows (TURN **`NbcOfferSpec`** / **`NbcPortSpec`**, **`ObpPersistence`** **`nbc_expires_*`** / **`GetNbcBindWindowFor*`**) against session **`turn_seq`** and **`relay_ts_ms`** from **`cfd.agent.relay#RelayEnvelope`** when hub relay policy applies (see **`cfd.obp.nbc`**). Thin **`cfd.obp#Offer`** / **`cfd.obp#Port`** carry **no** expiry fields.
///
/// **Canonical JSON (leaf input):** For each operation value **`op`**, implementations compute UTF-8 JSON with **recursively sorted object keys**;
/// arrays preserve element order; **`null`**, booleans, numbers, and strings use normal JSON encoding (**`JSON.stringify`** rules).
/// This document calls that string **`canonical_json(op)`**.
///
/// **Leaf domain separation:** Let **`LEAF_PREFIX`** be the UTF-8 bytes of the literal ASCII string **`OBP_SESSION_LEAF_v1`**
/// immediately followed by a single **`NUL`** byte (**`0x00`**), immediately followed by the UTF-8 bytes of **`canonical_json(op)`**.
/// The **leaf hash** is **`L_i = SHA-256(LEAF_PREFIX)`** (output 32 bytes).
///
/// **Empty operation log:** When **`n = 0`**, there are no operation leaves. The Merkle **root** is defined as the same leaf hash function
/// applied to the **literal** UTF-8 string **`__empty_session_op_log__`** (not **`canonical_json`** of a JSON value): i.e.
/// **`SHA-256(OBP_SESSION_LEAF_v1 || NUL || UTF-8("__empty_session_op_log__"))`** using the same **`LEAF_PREFIX`** construction
/// with **`canonical_json` replaced by that literal string’s UTF-8 bytes.
///
/// **Internal Merkle nodes:** For 32-byte child digests **`left`** and **`right`**, **`H_internal(left, right) = SHA-256( 0x01 || left || right )`**
/// (one-byte prefix **`0x01`**, then concatenation).
///
/// **Merkle tree:** Binary reduction left-to-right within each level using **`H_internal`**. If a level has an **odd** number of nodes,
/// **duplicate the last node** so it pairs with itself. **`root_hex`** for **`n`** ops is **`Checkpoint.root_hex`**: lowercase hex of the 32-byte root,
/// length **64**, no **`0x`**. Reference implementations MAY rebuild the root from the full leaf list at each checkpoint (**O(n)**).
///
/// **Checkpoint:** **`Checkpoint.seq`** equals **`n`**, the count of ops included in the Merkle commitment (**`op_0 … op_{n-1}`**).
///
/// **Verification:** On receipt of **`SessionEnvelope`**, the peer MUST verify **`base_checkpoint`** equals its local agreed checkpoint,
/// then replay **`delta_ops`** on top of its local prefix, compute **`new_checkpoint`**, and compare to the claimed **`new_checkpoint`**.
/// On **any** mismatch, reject the message and MUST NOT partially apply **`delta_ops`**. Discriminated failures are modeled by **`VerifyError`**.
///
/// **Fork / rollback:** After rejection, implementations SHOULD discard tentative tail state and restore **last mutually agreed**
/// **`{ seq, root_hex }`**, e.g. via persisted snapshots or replay from an exported **`ObpPersistence`** state.
///
/// **Replay into `ObpPersistence`:** When applying **`delta_ops`** after verification, implementations MUST apply effects in order and MUST enforce the same **`cfd.obp#ObpPersistence`** invariants as live frames (see **`packages/obp/v2/persistence/spec/model/persistence.smithy`**, including NBC **global canonical `NbcPortExposePolicy.max_bindings`** and **atomic** bind enforcement when multiple writers target the same store). **`Checkpoint.seq`** orders the **session op log**; it does **not** by itself define cross-store global ordering across unrelated persistence instances. Choosing shared versus partitioned backends for replay matches deployment choice for live frames and is **implementation-defined** subject to **`packages/obp/v2/persistence/spec/model/persistence.smithy`** invariant **11**.
///
/// **Inclusion proofs:** Optional on the wire: standard Merkle sibling hashes from leaf row to root; verifiers walk **`H_internal`**
/// with the same odd-count pairing rule used to build the tree.
///
/// **Wire shapes in this model:** **`Checkpoint`**, **`SessionEnvelope`**, **`SessionOp`**, **`VerifyError`**.
service NegotiationSessionProtocol {
    version: "2026-05-15"
    operations: []
}
