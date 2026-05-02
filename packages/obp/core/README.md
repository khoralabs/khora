# `@cfd/obp-core`

TypeScript **domain layer** for the Offer Binding Protocol (see [`packages/obp/spec`](../spec)). It mirrors the split between **`memories-core`** (types, invariants, client) and concrete persistence backends.

## Spec relationship

- **Smithy package** **`@cfd/obp-spec`**: [`../spec/model/shapes.smithy`](../spec/model/shapes.smithy), [`../spec/model/persistence.smithy`](../spec/model/persistence.smithy).
- **This package** implements the normative TS contract: types aligned with those models (including structured refinement for `Document` fields via Zod), pure **invariant** helpers, **`ObpPersistence`**, and **`ObpClient`**.

## Smithy ↔ TS parity (persisted contract)

| Smithy | TypeScript |
|--------|------------|
| `Party`, `Offer`, `Port`, `SourceMapRef`, `ExtendsEdge`, `ExposesEdge`, `BindsEdge` | `model/types.ts` same fields; `Port.bind_policy` / edge payloads are **`Document`** on the wire, **`PortBindPolicy`** / records in TS |
| `GetPartyResult` / `GetOfferResult` / `GetPortResult` unions (`notFound` vs payload) | `{ kind: "notFound" } \| { kind: "found"; … }` |
| `ExtendOfferInput.counterparty_bind`, `BindPortInput.counterparty_bind` | `ExtendOfferInput`, `BindPortInput` optional `counterparty_bind` |
| `BindListingRow` (`bind_policy_snapshot`) | `BindListingRow.bind_policy_snapshot` (audit snapshot at bind) |
| `ObpPersistence` operations (including **IsPortExposed**, **ListBinds**, **GetPortsSnapshot**, **GetExtendingPartyId**) | `ObpPersistence` methods; **`GetExtendingPartyId`**: Smithy empty `partyId` ↔ TS **`null`** |

Pure helpers (**`validateBindPreconditions`**, Zod parsers) are TS-only; normative behavior they enforce is duplicated in **`persistence.smithy`** `@documentation` invariants.

## Contents

| Area | Role |
|------|------|
| **Types** (`model/types.ts`) | Graph entities, **`BindListingRow`**, operation inputs/results. |
| **Invariants** (`invariants/`) | Port **`ref`** resolution, expiry, **`validateBindPreconditions`**, **`max_bindings`** vs canonical port. |
| **`ObpPersistence`** (`persistence-types.ts`) | Mirrors Smithy **`ObpPersistence`** service surface. |
| **`ObpClient`** (`client.ts`) | Validates then delegates; optional `{ now }`. |
| **`ObpError`** | `NOT_FOUND`, `EXPIRED`, `NOT_EXPOSED`, `REF_CYCLE`, `REF_MISSING`, `MAX_BINDINGS`, `VALIDATION`. |

## Tests / fakes

- **`FakeObpPersistence`** (`@cfd/obp-core/testing`) — in-memory implementation for unit tests.

## Normative invariants (spec)

See **`persistence.smithy`**: **EXTENDS** per offer, bind targets **EXPOSES**d, expiry, **`max_bindings`** after **`ref`**, **ref** cycles, **`terminal`** hint, **bind-policy** satisfaction on **BINDS**, register-party non-empty name.

## Verification

```bash
bun run --filter @cfd/obp-core test
bun run --filter @cfd/obp-core typecheck
```

Root repo: `bun run --filter @cfd/obp-spec validate`.
