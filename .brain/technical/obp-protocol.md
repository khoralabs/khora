# OBP — Protocol Architecture

> **OBP is a minimal wiring calculus for agent affordances.**
> A Party publishes Offers. Each Offer binds the Ports it depends on and exposes the Ports it provides. Composition wires exposed ports into bound ports, allowing agents, brokers, relays, tools, and workflows to be built as networks of interoperable offers.
>
> Short form: **OBP is imports/exports for agency. The interface algebra of agent systems.**

OBP is not policy, authorization, evidence, ownership, commitment, or execution. It is the structural substrate those layers operate on. NBC (Negotiated Binding Convention) is the named layer of conventions for using OBP in a negotiated peer-to-peer context.

---

## Core ontology

The entire OBP core reduces to three node types and two relation types:

```
Party
Offer
Port

Party -[:OFFERS]-> Offer
Offer -[:EXPOSES]-> Port
Offer -[:BINDS]->   Port
```

| Node | Meaning |
|------|---------|
| `Party` | Agent, organization, person, or service that publishes offers |
| `Offer` | An interface object — a local module of agency |
| `Port` | A named interface point; OBP is blind to what a port means |
| `EXTENDS` | Party owns this Offer (persistence projection relation) |
| `EXPOSES` | Offer exports this Port — an affordance available to others |
| `BINDS` | A committed binding: Port → Offer |

An Offer is best read as:

```
Offer : BoundPorts → ExposedPorts
```

Or equivalently: `Offer = thing with imports and exports`.

---

## Minimal formal shape

```
𝒫 = set of Parties
𝒪 = set of Offers
ℛ = set of Ports

offers  ⊆ 𝒫 × 𝒪
exposes ⊆ 𝒪 × ℛ
binds   ⊆ 𝒪 × ℛ

in(O)  = { p ∈ ℛ | binds(O, p) }
out(O) = { p ∈ ℛ | exposes(O, p) }
```

Composition is possible when one offer binds a port another exposes:

```
O₁ exposes p
O₂ binds   p
──────────────
O₂ ∘ₚ O₁     (O₁ provides p; O₂ requires p)
```

---

## Wiring calculus

### Sequential composition

```
in(O₂ ∘ₚ O₁)  = in(O₁) ∪ (in(O₂) − {p})
out(O₂ ∘ₚ O₁) = (out(O₁) − {p}) ∪ out(O₂)   # p hidden after composition
```

The broker pattern: `BloomOffer ∘ SupplierOffer : SupplierInputs → BuyerRfqPort`

### Parallel composition

```
O₁ ⊗ O₂

in(O₁ ⊗ O₂)  = in(O₁) ∪ in(O₂)
out(O₁ ⊗ O₂) = out(O₁) ∪ out(O₂)
```

Independent affordance modules running concurrently.

### Hiding / encapsulation

```
hide p in O

in(hide p in O)  = in(O)  − {p}
out(hide p in O) = out(O) − {p}
```

A broker binds supplier-side ports internally while exposing only curated buyer-facing ports externally.

### Relabeling / translation

```
rename f in O   where f : Port → Port

in(rename f O)  = f(in(O))
out(rename f O) = f(out(O))
```

Captures interface translation across vocabularies:
`supplier_internal_quote_port → bloom_verified_quote_port → buyer_rfq_response_port`

### Choice

```
O₁ + O₂

in(O₁ + O₂)  = in(O₁) ∪ in(O₂)
out(O₁ + O₂) = out(O₁) ∪ out(O₂)
```

Alternative ports available; the kernel decides whether binding one disables others.

---

## Frame model

All data transmitted in an OBP session is encapsulated in a **Frame**:

| Field | Type | Description |
|-------|------|-------------|
| `p_hash` | `hex` | SHA-256 hash of the preceding frame — causal integrity chain |
| `actor` | `hex` | Public key of the sender |
| `sig` | `hex` | Signature over frame content |
| `type` | `enum` | `PROLIFERATE`, `RESOLVE`, or `TERMINATE` |
| `body` | `object` | Offer, Bind, or Close payload |

### Hardened constraints

1. **Strict ordering** — a frame whose `p_hash` does not match the local DAG tip is rejected
2. **Identity verification** — invalid signature → immediate session termination
3. **Offer expiry** — optional TTL; a `BIND` received after TTL is invalid; requires re-proliferation
4. **No partial binds** — a port is either fully bound (satisfying policy) or not at all

---

## Session state machine (the Turn Contract)

OBP is a bilateral state machine alternating between two phases:

### Phase I — Proliferation (EXPOSE)

The active party declares potential future states by exposing Ports on an Offer.

- **Offer**: semantic context ("I am selling a motor")
- **Port**: valid exit branches ("Order", "Query Specs")
- An Offer is a **Potentiality** — it does not become Actual until a Port is bound

### Phase II — Resolution (BIND)

The passive party selects exactly one Port to progress the state.

- **Atomic consumption**: binding a port consumes the parent Offer; all sibling ports pruned
- **Satisfaction**: the `BIND` frame must include a `payload` satisfying the port's `bind_policy`
- **Turn handover**: after a valid BIND, the binder becomes the new active party (EXPOSE turn)

### Merkle anchoring

```
S_n = H(Frame_n + S_{n-1})
```

Each `SessionEnvelope` carries `Checkpoint.root_hex` over all prior operations. Tampered or dropped operations produce a detectable root mismatch. Memory provenance can be anchored to `S_n` hashes.

**Future research:** use verified DAG checkpoints (`genesis_hash` + Merkle root) as logical join keys for ephemeral relay re-init and peer-sync late join — not relay spool history. Principal must prove party membership; see [`dag-join-key-research.md`](dag-join-key-research.md).

---

## OBP vs NBC — two-tier conformance

**Pure OBP** (structural layer):
- Signed DAG and optional session envelope
- Persistence projection: `obp_parties`, `obp_offers`, `obp_ports`, `obp_extends`, `obp_exposes`, `obp_binds`
- Graph invariants: EXTENDS uniqueness, bind targets an EXPOSES'd port, ref sanity, party registration shape

**Negotiated Binding Convention (NBC)** (policy layer on top):
- Ledger/expiry semantics (`ledger_seq`)
- Global `max_bindings` caps and binding capacity enforcement
- `bind_policy` / `counterparty_bind` validation
- Concurrent bind atomicity rules (N1–N9)
- Delegation clause: an NBC driver **wraps** a pure OBP driver — applies preconditions/refusals/policy around each delegation step

A minimal OBP implementation is spec-conformant without NBC. NBC is additive.

```
flowchart TB
  subgraph nbc [NBC driver]
    social[Social & contextual bind rules]
    ledger[Ledger & expiry semantics]
    policy[Port bind_policy enforcement]
  end
  subgraph obp [Pure OBP driver]
    frames[NegotiationFrameProtocol]
    session[NegotiationSessionProtocol]
    persist[ObpPersistence projection]
  end
  nbc -->|delegates| obp
```

---

## Package layering

Seven layers with an acyclic dependency graph:

| Layer | Owns | Boundary |
|-------|------|----------|
| `obp-model` | Smithy Party/Offer/Port shapes; pure type helpers | No persistence, no frames, no Merkle |
| `obp-persistence` | `ObpPersistence` service spec; projection invariants; SQLite + in-memory adapters; `OBPPersistenceClient` facade | Graph + RPC surface only |
| `obp-nbc` | NBC Smithy; normative NBC rules; optional NBC driver TS | Depends on persistence; OBP-only stacks can omit |
| `obp-frames` | `NegotiationFrameProtocol`; frame DAG; sign/verify; `runFrameSession`/multiplex | Projects turns into persistence; does not own long-term schema |
| `obp-session` | `NegotiationSessionProtocol`; Merkle rules; `checkpointFromOps`; `verifyExtends` | Commits to op log/checkpoints, not SQL tables |
| `obp-transport-*` | HTTP/2 h2c, WebSocket relay, in-memory `FrameChannel` | No graph logic; maps transport ↔ frame stream |
| `obp-agents` | Coordinator, ledger, LLM prompt surface, React graph UI | Depends on frames + persistence + NBC; not part of minimal conformance |

Dependency order: `model → persistence → frames → session`; `nbc` is a sidecar on persistence; `transport` at the leaf.

---

## What OBP is not

OBP core is not: policy, authorization, evidence validation, visibility, ownership semantics, commitment semantics, expiry, execution, LLM prompting, payment, memory, trust, or reputation. Those are layers that interpret or constrain the OBP graph.

A port can be interpreted as a capability, a tool, a legal commitment point, a payment endpoint, a social affordance, a memory operation, or a workflow transition — but OBP only records the interface topology.

---

## Kernel stack

```
Local meaning / TAM
  interprets ports as affordance regions

OBP
  wires offers and ports

Policy / capability kernel
  resolves visible/executable affordances

Runtime / event ledger
  executes and records transitions

Applications
  marketplace, relay, todo, CRM, supplier network
```

OBP is the **wiring calculus inside the kernel** — not the whole kernel.

---

## Pending spec work

- [ ] Split `persistence.smithy` `@documentation` into OBP-universal graph invariants vs NBC-specific rules (cross-link to NBC spec)
- [ ] Add `negotiated-binding-convention.smithy` (namespace `cfd.obp.nbc`) — normative NBC prose + `ledger_seq` semantics + delegation clause
- [ ] Add narrative doc: OBP vs NBC, conformance levels, NBC driver → pure OBP driver pattern
- [ ] Run `bun run --filter @khoralabs/obp-spec validate` after Smithy edits
