# `@khoralabs/obp-core`

TypeScript **domain layer** for the Offer Binding Protocol (see [`packages/obp/persistence/spec`](../persistence/spec)). It mirrors the split between **`memories-core`** (types, invariants) and concrete persistence backends; the validated **`OBPPersistenceClient`** lives in **`@khoralabs/obp-persistence-client`**.

## Spec relationship

- **Smithy package** **`@khoralabs/obp-spec`**: [`../persistence/spec/model/shapes.smithy`](../persistence/spec/model/shapes.smithy), [`../persistence/spec/model/persistence.smithy`](../persistence/spec/model/persistence.smithy), [`../persistence/spec/model/negotiated-binding-convention.smithy`](../persistence/spec/model/negotiated-binding-convention.smithy) (**Negotiated Binding Convention**, NBC — conventions on top of OBP for bind admissibility and orchestration; see [`../documentation/negotiated-binding-convention.md`](../documentation/negotiated-binding-convention.md)).
- **This package** implements the normative TS contract: types aligned with those models—including structured refinement for `Document` fields via Zod—pure **invariant** helpers, and frame/session DAG behavior. **`ObpPersistence`** / **`OBPPersistenceClient`** are implemented in **`@khoralabs/obp-persistence-client`** (re-exported from **`@khoralabs/obp-sqlite`** with a SQLite factory).

## Smithy ↔ TS parity (persisted contract)

| Smithy | TypeScript |
|--------|------------|
| `Party`, `Offer`, `Port`, `SourceMapRef`, `ExtendsEdge`, `ExposesEdge`, `BindsEdge` | `model/types.ts` same fields; `Port.bind_policy` / edge payloads are **`Document`** on the wire, **`PortBindPolicy`** / records in TS |
| `GetPartyResult` / `GetOfferResult` / `GetPortResult` unions (`notFound` vs payload) | `{ kind: "notFound" } \| { kind: "found"; … }` |
| `ExtendOfferInput.counterparty_bind`, `BindPortInput.counterparty_bind` | `ExtendOfferInput`, `BindPortInput` optional `counterparty_bind` |
| `BindListingRow` (`bind_policy_snapshot`) | `BindListingRow.bind_policy_snapshot` (audit snapshot at bind) |
| `ObpPersistence` operations (including **IsPortExposed**, **ListBinds**, **GetPortsSnapshot**, **GetExtendingPartyId**) | `ObpPersistence` methods; **`GetExtendingPartyId`**: Smithy empty `partyId` ↔ TS **`null`** |

Pure helpers (**`validateBindPreconditions`**, Zod parsers) are TS-only; normative behavior they enforce for NBC is specified in **`negotiated-binding-convention.smithy`**; OBP graph rules remain in **`persistence.smithy`**.

## Contents

| Area | Role |
|------|------|
| **Types** (`model/types.ts`) | Graph entities, **`BindListingRow`**, operation inputs/results. |
| **Invariants** (`invariants/`) | Port **`ref`** resolution, expiry, **`validateBindPreconditions`**, **`max_bindings`** vs canonical port. |
| **`ObpPersistence`** | [`@khoralabs/obp-persistence-client`](../../persistence/client/src/persistence-types.ts) — mirrors Smithy **`ObpPersistence`** service surface. |
| **`OBPPersistenceClient`** | [`@khoralabs/obp-persistence-client`](../../persistence/client/src/obp-persistence-client.ts) — validates then delegates; requires **`ledgerSeq`**. |
| **`ObpError`** | `src/obp-error.ts` — `NOT_FOUND`, `EXPIRED`, `NOT_EXPOSED`, `REF_CYCLE`, `REF_MISSING`, `MAX_BINDINGS`, `VALIDATION`, and frame-session codes used by the DAG layer. |

## Tests / fakes

- **`FakeObpPersistence`** — import from **`@khoralabs/obp-persistence-client`** or **`@khoralabs/obp-core/testing`** (re-export).

## Normative invariants (spec)

- **OBP (graph / projection):** see **`persistence.smithy`** — **EXTENDS** per offer, bind targets **EXPOSES**d, **ref** cycles / resolution, **`terminal`** hint, register-party non-empty name.
- **Negotiated Binding Convention (NBC):** expiry vs **`ledger_seq`**, **`max_bindings`** after **`ref`**, **bind-policy** satisfaction on **BINDS**, concurrent cap atomicity — see **`negotiated-binding-convention.smithy`** (`cfd.obp.nbc`) and [`../documentation/negotiated-binding-convention.md`](../documentation/negotiated-binding-convention.md). **`@khoralabs/obp-persistence-client`**’s **`OBPPersistenceClient`** currently implements OBP + NBC rules together.

## Verification

```bash
bun run --filter @khoralabs/obp-core test
bun run --filter @khoralabs/obp-core typecheck
```

Root repo: `bun run --filter @khoralabs/obp-spec validate`.

## Bilateral frame protocol (`src/frames/`)

Transport-agnostic **Frame** DAG aligned with [`frame-protocol.smithy`](../persistence/spec/model/frame-protocol.smithy): signing, `FrameDag` causal tips, length-prefixed canonical JSON framing (`framing.ts`), duplex transport (`FrameChannel` from `@khoralabs/frame-channel`), and `runFrameSession` / `runFrameMultiplexSession`. **Graph effects** (`applyTurn`) run for **inbound** and **outbound** `TURN` frames so each peer updates its own `ObpPersistence`; tests should give each runner a separate store (see `FakeObpPersistence` + `importState` for party ids).

**Outbound serialization:** for each open chain, `runFrameMultiplexSession` queues outbound work so **`mintOutbound`**, session-op accumulation, tip-map updates, framed writes, and envelope flush scheduling do not interleave across concurrent **`sendTurn`** / **`onIncomingOffer`** replies (peer inbound handling stays sequential on the read loop).

**Negotiation helpers:** optional **`createNegotiationCoordinator`** / **`waitForPortOnOffer`** (`frames/negotiation-coordinator.ts`) wrap **`MultiplexChainHooks`** with **`waitForTurn`** for awaiting matching inbound **`TurnBody`** snapshots (timeouts / **`AbortSignal`**); termination or **`dispose`** rejects pending waiters.

The HTTP/2 binding lives in [`@khoralabs/obp-server`](../server).
