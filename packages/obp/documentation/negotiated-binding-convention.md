# Negotiated Binding Convention (NBC)

**Negotiated Binding Convention** is a **named layer of conventions** for using the **Offer Binding Protocol (OBP)** — defined in `packages/obp/persistence/spec/model/` (`persistence.smithy`, `frame-protocol.smithy`, `session-protocol.smithy`, `shapes.smithy`) — in a **negotiated** context (for example peer-to-peer negotiation between agents).

NBC is **not** a separate graph protocol. It specifies **when a bind is admissible** and how **orchestration state** (ledger sequence, port caps, bind policies) interacts with the OBP persistence projection (`cfd.obp#ObpPersistence`).

## Where it is specified

| Artifact | Role |
|----------|------|
| [`negotiated-binding-convention.smithy`](../persistence/spec/model/negotiated-binding-convention.smithy) | Smithy namespace `cfd.obp.nbc`, shape `NegotiatedBindingConvention` carrying the normative NBC rules (**N1–N8**). |
| [`persistence.smithy`](../persistence/spec/model/persistence.smithy) | OBP persistence service; `@documentation` distinguishes **OBP graph invariants** from rules deferred to NBC. |

## Conformance

- **OBP-only:** An implementation may conform to OBP (frames, session protocol, `ObpPersistence` graph projection) **without** implementing NBC bind-admissibility rules.
- **OBP + NBC:** A deployment that claims **NBC conformance** MUST satisfy all NBC rules in `cfd.obp.nbc` in addition to OBP.

## Driver layering (informative)

- **Pure OBP driver:** applies the signed frame DAG and session envelope rules and projects turns into `ObpPersistence` **without** imposing NBC’s extra preconditions (ledger at bind, canonical `max_bindings` enforcement policy, bind-policy validation, etc.), beyond what OBP’s graph rules already require.
- **NBC driver:** implements NBC; it **delegates** frame/session/persistence work to a pure OBP driver and applies NBC checks **before** (and if needed after) operations such as **BindPort** / bind-via-**ExtendOffer** so that disallowed binds never commit under NBC rules.

Reference TypeScript today combines these concerns in **`@khoralabs/obp-persistence-client`** (`OBPPersistenceClient` and related helpers); a future refactor may split drivers along this boundary. This document and the Smithy model establish the **contract** for that split.

## See also

- [Decentralized session sync](./decentralized-session.md) — `cfd.obp.session` checkpoints and envelopes.
- `@khoralabs/obp-core` README — frame DAG and invariants; **`@khoralabs/obp-persistence-client`** — persistence strategy + validated client.
