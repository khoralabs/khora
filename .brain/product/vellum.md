# Vellum — Bilateral Negotiation Protocol

Vellum implements OBP (Offer Binding Protocol) and NBC (Negotiated Binding Convention): a formal, cryptographically verifiable system for two agents to negotiate and commit to structured agreements over Vellum channels.

---

## The problem Vellum solves

When two autonomous agents reach an agreement today, the record of that agreement lives in a proprietary log no outside party can inspect or verify. There is no equivalent of a signed contract for machine-to-machine interactions.

Vellum provides:
- A **typed DAG model** for negotiation state (not a chat transcript)
- **Merkle-checkpointed sessions** — tampered or dropped operations produce a cryptographically detectable root mismatch
- **E2EE frame bodies** — the relay routes ciphertext; it never learns negotiation semantics
- **Bind policies** — agents can encode constraints their principals set (rate floors, work-hour caps, binding capacity limits) that are enforced automatically

---

## OBP — The graph model

The Offer Binding Protocol defines a directed acyclic graph:

```
Party ──EXTENDS──▶ Offer ──EXPOSES──▶ Port ──BINDS──▶ Offer
```

| Node | Meaning |
|------|---------|
| `Party` | One negotiating agent |
| `Offer` | A structured proposal from a Party |
| `Port` | An affordance on an Offer — a bindable slot with a type, promise, and optional policy |
| `EXTENDS` | Party owns this Offer |
| `EXPOSES` | Offer exposes this Port (locks the Offer once bound) |
| `BINDS` | A committed binding: Port → Offer |

Every state transition is a signed frame entry. The graph enforces invariants no unilateral party can violate.

**Schema** (SQLite, per channel): `obp_parties`, `obp_offers`, `obp_ports`, `obp_extends`, `obp_exposes`, `obp_binds`

---

## NBC — When binds are allowed

The Negotiated Binding Convention is a layered compliance protocol on top of OBP that governs **when a bind is admissible**:

- **N1–N9 rules** — formal rules enforcing expiry windows, binding capacity caps (`max_bindings`), bind-policy validation, concurrent bind atomicity
- **Bind policies** — JSON policies on ports; agents set constraints their principals require
- **NBC bind windows** — time-bounded, turn-bounded expiry projections on offers and ports

The Smithy specification (`packages/obp/v2/nbc/spec`) is the normative source; TypeScript implements it.

---

## Session mechanics

Each bilateral session runs over a frame channel (slice 1: Vellum channel-relay WebSocket; Khora is discovery-only):

**Roadmap:** Vellum owns channel allocation, relay infra, pluggable principal auth, and N-peer channel multiplex with bilateral NBC chains only. See [`technical/khora-vellum-separation.md`](../technical/khora-vellum-separation.md).

1. **SessionInit** — exchanged `init` envelopes establish `session_id`, party identities, actor public keys, and `genesis_hash`
2. **E2EE handshake** — two plaintext `e2ee_hs` frames exchange ephemeral X25519 public keys
3. **Session keys** — HKDF derives AES-256-GCM keys bound to `session_id`; relay never holds private ephemeral keys
4. **TURN frames** — encrypted OBP operations (offers, port specs, bind requests)
5. **Merkle checkpoints** — each `SessionEnvelope` carries `Checkpoint.root_hex` over all prior operations

**Local state:** the Vellum daemon persists OBP state in a per-channel SQLite DB at `~/.vellum/data/vellum/channels/<channelId>/obp.sqlite`.

---

## The daemon model

Vellum runs as a **long-lived local daemon** — not a server the relay controls. Each agent runs their own daemon:

- Opens a multiplex WS connection to the Vellum channel-relay
- Manages one SQLite OBP database per channel
- Exposes a local HTTP control server that the CLI uses
- Writes a PID/control file for process management

The daemon holds the agent's signing keys and OBP state. The relay holds only ciphertext and routing metadata.

**CLI:** `vellum` entrypoint — connect to channels, manage chains, offers, ports, and bind policies

---

## The Knowledge Bazaar

The Knowledge Bazaar is the reference deployment of Vellum — a closed pilot where professional users connect agents to the Khora network for knowledge-exchange and coordination use cases.

The pilot validates the core hypothesis: **agents representing humans in structured, constrained negotiations produce better outcomes than unmediated human negotiation or keyword-matching platforms**.

---

## Research contributions

OBP/NBC embeds novel research:

1. **OBP graph model** — a typed DAG with causal edges and enforced invariants; not a simplification of existing negotiation protocols which assume centralized arbitration
2. **Merkle-checkpointed bilateral sync** — extends Byzantine-fault-tolerant log research to the two-party agent setting
3. **NBC formal specification** — Smithy-specified compliance rules with independently testable invariants
4. **Privacy-preserving relay architecture** — architectural guarantee (not a policy commitment) that the relay cannot decrypt negotiation content

**Open research questions:** formal verification of OBP invariants, multi-party extension (N > 2), value-firewall grounding (claims from verified Domus only), regulatory mapping to EU AI Act Article 12.

---

## Workflow capture before runtime automation

Vellum is valuable *before* agents drive negotiations. Companies can use manually-crafted ports and offers to model their real transactions in the **same OBP shape** they would later use to automate them. Humans transact through the typed DAG; the company captures the structure and outcomes of real deals.

This is a judgment-capture play. By the time the company is ready to put an agent behind the negotiation, it already has:
- A library of port/offer shapes that match its actual deal flow
- A corpus of real human negotiations in OBP form — training/grounding data for the eventual agent
- A proven mapping from its business logic to bind policies

This maps directly onto the Dark Marketplace "authoring layer" and the Stage 1→4 judgment-abstraction arc: start by capturing the shape of human decisions, then progressively let the agent make them. Vellum is the structured medium that makes that progression continuous rather than a rebuild.

---

## Mandate Guard — structural policy enforcement

The critical missing layer between the NBC wire protocol and the strategy LLM is the **Mandate Guard** — a runtime filter that makes an agent structurally unable to violate its principal's mandate.

The LLM never sees the mandate, constraint logic, or CEL expressions. It only sees the filtered set of allowed moves (`TurnDecision`). Policy is enforced by construction, not by instruction.

See [`technical/mandate-guard.md`](../technical/mandate-guard.md) for the full design.

---

## Package map

| Concern | Package |
|---------|---------|
| OBP v2 spec (Smithy) | `packages/obp/v2/` (model, nbc, frames, session, persistence) |
| TypeScript OBP/NBC impl | `packages/obp/v2/*/impl/ts/` |
| SQLite persistence | `@khoralabs/obp-sqlite-persistence` |
| Frame E2EE | `packages/obp/v2/frames/impl/ts/` |
| Vellum contracts | `@khoralabs/vellum-contracts` |
| Vellum client | `@khoralabs/vellum-client` |
| Daemon | `apps/vellum/daemon` |
| CLI | `apps/vellum/cli` |
