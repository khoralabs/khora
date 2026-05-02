# Decentralized bilateral negotiation session (OBP extension)

This document extends the core **Offer Binding Protocol** graph model ([`shapes.smithy`](../spec/model/shapes.smithy)) with a **session-scoped**, **ledger-sequence** timeline and optional **Merkle commitments** so two peers can agree on history without sharing a single centralized database.

## Session scope

- A **negotiation session** is identified by **`session_id`** (opaque string, agreed out of band or at handshake) and exactly **two participant party ids**.
- **Complete history** in messages means the **ordered operation log for this session only**—the subgraph both parties treat as authoritative for this negotiation—not every Party/Offer/Port in an implementor’s global store.
- Implementations SHOULD serialize only **in-session** operations when forming leaves for Merkle roots (e.g. parties created for this channel, offers/ports/binds that belong to this negotiation).

## Ledger sequence (no wall clock for validity)

- **`ledger_seq`** is a monotonic non-negative integer advanced by the session driver when operations are **committed** (same notion can align with coordinator turns or finer-grained commits).
- Persisted validity uses **`created_seq`** and **`expires_seq`** on entities and edges (see Smithy). Bind/expose preconditions use: bind allowed iff **`ledger_seq < expires_seq`** for the binding **Offer** and target **Port** (plus structural invariants unchanged from core OBP).
- **Revocation** sets **`expires_seq`** to the **current `ledger_seq`** at revoke time so subsequent binds fail the expiry check.

## Operation log

The session log is a totally ordered list **`op_0 … op_{n-1}`** where each **`op_k`** is an abstract mutation both peers agree to support (e.g. register party, extend offer, expose port, bind port, revoke port/offer—aligned with [`ObpPersistence`](../spec/model/persistence.smithy) operations relevant to the slice).

**Canonical encoding** (normative for hashing):

- UTF-8 JSON with **stable key order** (sorted keys recursively) **or** another fixed binary encoding documented by the implementation.
- Each leaf hashes **`SHA-256(domain_sep || canonical_bytes(op_k))`** with a documented **`domain_sep`** (e.g. UTF-8 string `"obp.session.op.v1"`).

## Merkle checkpoint (full rebuild)

At checkpoint **`n`**, implementations compute **`root_n`** as the **binary Merkle root** over leaf hashes **`L_0 … L_{n-1}`** with this **odd-count rule**:

- Reduce each level pairwise: **`H(left || right)`** using **`SHA-256`**.
- If a level has an **odd** number of nodes, **duplicate the last node** so it pairs with itself.

**No incremental Merkle** is required in reference implementations: **rebuild `root_n` from the full leaf list** at each checkpoint (**O(n)**). Tests MUST use the same rule.

**Inclusion proofs** (optional on the wire): standard Merkle siblings list for index **`i`**; verifiers check **`verifyInclusion(root_n, L_i, i, proof)`**.

## Wire envelope (logical shape)

Messages SHOULD carry enough material for prefix agreement:

| Field | Meaning |
|--------|---------|
| **`session_id`** | Session identifier |
| **`from_party`** | Sender party id |
| **`base_seq`** | Sequence index after last agreed op (checkpoint) |
| **`base_root`** | Merkle root through **`op_0 … op_{base_seq-1}`** |
| **`delta_ops`** | Ordered ops appended after base |
| **`new_seq`** | `base_seq + length(delta_ops)` |
| **`new_root`** | Merkle root through full prefix including delta |

**Verification**: Receiver recomputes **`new_root`** from **`prefix || delta_ops`** (prefix reconstructed locally up to **`base_seq`**). If **`base_root`** does not match local state, or **`new_root`** mismatches, **reject**.

## Fork handling and rollback

1. On mismatch, **reject** the message (no partial apply of **`delta_ops`**).
2. **Roll back** local materialized state to the **last mutually agreed checkpoint** **`{ seq, root }`** (discard tentative tail).
3. Implementations SHOULD persist **checkpoint snapshots** (serialized graph or replay log) to restore quickly; [`FakeObpPersistence`](../../core/src/testing/fake-obp-persistence.ts) supports **`exportState` / `importState`** for tests and patterns.

## Social proof / chain anchoring

Publishing **`{ session_id, seq, root }`** (and optionally inclusion proofs) on a blockchain/L2 is **orthogonal**: the same Merkle definition applies for **peer-to-peer** verification and **public** audit.

## Reference implementation

TypeScript helpers live in **`@cfd/obp-session-sync`** (`packages/obp/session-sync`): canonical hashing, Merkle root/proofs, envelope verification—**no networking**.
