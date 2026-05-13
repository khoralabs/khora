# Decentralized bilateral negotiation session (reader guide)

**Normative spec:** [`packages/obp/persistence/spec/model/session-protocol.smithy`](../persistence/spec/model/session-protocol.smithy) — namespace **`cfd.obp.session`**, service **`NegotiationSessionProtocol`**. That model defines wire shapes (**`Checkpoint`**, **`SessionEnvelope`**, **`SessionOp`**, **`VerifyError`**) and the exact rules for canonical JSON, leaf hashing (**`OBP_SESSION_LEAF_v1` + NUL + UTF-8**), empty-log sentinel (**`__empty_session_op_log__`**), internal Merkle nodes (**`0x01 || left || right`** then SHA-256), duplicate-last pairing, **`root_hex`** encoding, verification, and rollback.

Core OBP graph semantics remain in [`shapes.smithy`](../persistence/spec/model/shapes.smithy) and [`persistence.smithy`](../persistence/spec/model/persistence.smithy); **`ObpPersistence`** does not import the session namespace.

## Reference implementation

TypeScript helpers live in **`@khoralabs/obp-session-sync`** (`packages/obp/session-sync`): canonical JSON, Merkle root/inclusion proofs, envelope verification—**no networking**. Implementations SHOULD match the Smithy text; if they diverge, treat Smithy as authoritative.
