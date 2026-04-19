# `@cfd/obp-core`

TypeScript **domain layer** for the Offer Binding Protocol (see [`packages/obp-spec`](../obp-spec)). It mirrors the split between **`memories-core`** (types, invariants, client) and concrete persistence backends.

## Spec relationship

- **Wire / RPC shapes** live in **`@cfd/obp-spec`** (`shapes.smithy`, `persistence.smithy`).
- **This package** is the normative **developer contract** for OBP logic in TS: exported types aligned with those models, pure **invariant** helpers, a **persistence port** (`ObpPersistence`), and **`ObpClient`** orchestration.

## Contents

| Area | Role |
|------|------|
| **Types** (`model/types.ts`) | `Party`, `Offer`, `Port`, `SourceMapRef`, edge records, operation inputs/results. |
| **Invariants** (`invariants/`) | Pure functions: port `ref` resolution (cycles, missing ids), expiry (`now < ts_expired`), **`validateBindPreconditions`** (exposure, `max_bindings` vs canonical port). |
| **`ObpPersistence`** (`persistence-types.ts`) | Strategy interface: Smithy **ObpPersistence** operations plus **`isPortExposed`**, **`listBinds`**, **`getPortsSnapshot`** so `ObpClient` can run those checks before mutating (helpers are orchestration-only, not separate Smithy RPCs). |
| **`ObpClient`** (`client.ts`) | Takes `ObpPersistence` and optional `{ now }`; validates then delegates (same idea as `MemoriesClient` + `MemoriesPersistence`). |
| **`ObpError`** | Typed failures (`NOT_FOUND`, `EXPIRED`, `NOT_EXPOSED`, `REF_CYCLE`, `REF_MISSING`, `MAX_BINDINGS`, `VALIDATION`). |

## Tests / fakes

- **`FakeObpPersistence`** (`@cfd/obp-core/testing`) is an in-memory implementation for unit tests — **not** a production strategy.

## Normative invariants (spec)

From `persistence.smithy`: single **EXTENDS** per offer (enforced by stores), bind targets must be **EXPOSES**d, expiry, **`max_bindings`** after **`ref`** resolution, **ref** cycle detection, **`terminal`** is non-normative for bind rules.

## Verification

```bash
bun test
bunx tsc -p packages/obp-core --noEmit
```

Root repo: `bun run --filter @cfd/obp-spec validate`.
