# DAG join key and peer-sync relay (future research)

**Status:** Future research — not implemented. Informs relay spool policy, Vellum rejoin, and long-lived chain rendezvous.

**Related:** [`khora-vellum-separation.md`](khora-vellum-separation.md) § “DAG as join key”, [`obp-protocol.md`](obp-protocol.md), [`roadmap/open-questions.md`](../roadmap/open-questions.md).

---

## Problem

Today the frame relay hub persists every forwarded byte until channel re-creation and replays the full spool on `attachPeer`. That is convenient for short bilateral offline gaps but:

- Admitted peers can flood `relayBytes` and exhaust SQLite/disk.
- Late joiners can receive unbounded history into peer memory.
- The relay is treated as a history source even though **negotiation state already lives on participants** (local SQLite, Merkle-checkpointed `SessionOp` logs).

For bilateral rooms with two parties and modest traffic, capped spool is sufficient. The longer-term model treats the relay as **disposable live transport** and the bilateral DAG as **durable identity and state**.

---

## Research direction: two layers

| Layer | Role | Durable? |
|-------|------|----------|
| **Relay** (`channel_id` + admission ticket) | Opaque byte fan-out; optional tiny tail buffer for live catch-up | No — ephemeral |
| **Chain** (`session_id`, `genesis_hash`, Merkle checkpoint, actor pubkeys) | OBP/NBC negotiation identity and verified op log | Yes — on peers |

Rule: **OAuth / tickets at the transport edge; Ed25519 actors on the wire.** Principal auth and frame actor auth stay separate (see separation doc §2).

---

## Late join via peer-verified DAGs (not relay spool)

**Hypothesis:** Late join replay should be done by **peers exporting verified DAG material** (`SessionEnvelope` checkpoint exchange, framed history, or persistence export) — not by the relay retaining full history.

Target flow:

1. Principal authenticates to a relay instance (ticket, bearer, DID sig, etc.).
2. Late joiner presents a **rejoin descriptor** (see below) or requests sync for a known chain.
3. An incumbent peer (any holder of the agreed op prefix) sends one or more `SessionEnvelope` messages with verified `base_checkpoint`, `delta_ops`, `new_checkpoint`.
4. Joiner runs existing `verifySessionEnvelope` / `verifyExtends`; applies ops to local persistence; reconstructs frame DAG tip.
5. Both parties use the relay only for **live** frames after sync.

Existing building blocks:

- `SessionEnvelope` verification (`@khoralabs/obp-session-impl`).
- Multiplex runtime envelope handling (`frame-multiplex-runtime.ts`).
- Local `state.sqlite` on Vellum daemons.

Relay spool becomes an optimization (last K frames while sync runs), not source of truth. Bounded spool in `@khoralabs/obp-frame-relay` is a **DoS mitigation** on the path to this model, not a semantic regression for bilateral use today.

---

## DAG as join key (relay disposable / channel re-init)

When a relay instance dies or a `channel_id` TTL expires, participants should be able to **stand up new transport** without losing negotiation continuity.

**Rejoin descriptor (sketch, Vellum contract TBD):**

```json
{
  "session_id": "...",
  "genesis_hash": "<64-char hex>",
  "checkpoint": { "seq": 42, "root_hex": "<64-char hex>" },
  "parties": [{ "party_id": "...", "actor_pubkey": "..." }]
}
```

Properties:

- `genesis_hash` is effectively an unguessable anchor to outsiders (derived from initial chain material).
- `checkpoint` pins *which slice* of the chain is being continued.
- Parties recompute Merkle `root_hex` from frame-derived ops and reject mismatch.

**Channel re-init:** Same bilateral DAG → new `channel_id` / new relay container. Transport is recreated; logical session persists on devices.

**Global dedup (research):** Long-running or recurring bilateral work could map many transport instances to one **logical chain id**, e.g. canonical hash over `(genesis_hash, sorted actor_pubkeys)` or `(genesis_hash, checkpoint.seq)`. A private rendezvous directory could answer “where is DAG X hosted now?” without conflating transport with chain identity.

Open questions:

- Directory privacy vs dedup convenience (invite-only vs global index).
- Whether dedup key includes checkpoint or only genesis + parties.
- How roster / N-party multiplex interacts (mesh of bilateral chains, not one N-signer log).

---

## Security requirement: DAG knowledge is not sufficient for admission

**Using a DAG identifier as a shared secret MUST be accompanied by the principal proving they are one of the parties on that chain.**

Knowing or guessing `{ genesis_hash, checkpoint, parties }` must **not** alone grant relay attach or chain participation. Requirements:

1. **Principal verification** — The joining principal MUST authenticate (DID sig, OAuth JWT, registry session, mTLS, etc.) and the product layer MUST bind that principal to an `actor_pubkey` listed in the chain’s `SessionInit` parties.
2. **Actor verification** — Frame append remains Ed25519 over signing payload; NBC/DAG rules enforce `p_hash` and signatures on the wire.
3. **Checkpoint verification** — Joiner MUST recompute Merkle root from verified ops; incumbent MUST NOT be trusted blindly for history (envelope verify already does this).
4. **DAG id is confidentiality, not authorization** — Unpredictability of `genesis_hash` reduces enumeration; it does not replace ticket/OAuth/roster admission.

Anti-pattern: “Present genesis_hash at WS upgrade → attach with full replay.” That would let anyone who obtained the descriptor (leak, log, MITM on OOB share) join without proving principal ↔ party mapping.

Preferred pattern: principal auth → roster/policy checks actor is party → optional DAG descriptor for sync target → peer sync → live relay.

---

## Relationship to current implementation

| Today | Research target |
|-------|-----------------|
| Full spool replay on attach | Peer `SessionEnvelope` sync; optional spool tail |
| `channel_id` is primary room identity | `channel_id` ephemeral; DAG descriptor is logical join key |
| Khora `room_ticket` + spool for offline rejoin | Vellum rejoin descriptor + daemon export |
| Relay stores all frames until `createChannel` | Capped ring buffer + TTL purge; eventually minimal buffer |

Khora bilateral rooms can keep capped spool until P5/P6 in [`khora-vellum-separation.md`](khora-vellum-separation.md). Vellum is the natural first consumer of peer-sync rejoin.

---

## Suggested research phases

| Phase | Outcome |
|-------|---------|
| **R0 — Document & cap spool** | Ring buffer / replay caps on relay (DoS); document peer sync as canonical catch-up |
| **R1 — Rejoin descriptor contract** | Smithy/Zod type in `@khoralabs/vellum-contracts`; OOB share format |
| **R2 — Attach-time sync handshake** | WS or control API: `dag_sync_request` → peer envelopes; relay spool optional |
| **R3 — DAG-keyed rendezvous** | Private directory: logical chain id → current relay URL + ticket |
| **R4 — Principal↔party gate** | Normative admission: DAG descriptor + verified principal ∈ parties |

---

## Non-goals (unchanged)

- N-signer single causal log on one NBC chain — remains deferred; use bilateral mesh.
- Relay understanding NBC bind semantics — relay stays opaque bytes.
- Khora catalog as source of truth for Vellum chain identity.
