# Host persistence implementor’s guide

Contract for host projection / registration / social / teardown / invites storage.
Types: `@khoralabs/khora-host/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`../`](../) (package root) | **Product API** — host runtime, lifecycle, HTTP, memories, percolator bootstrap | `@khoralabs/khora-host` |
| [`./core`](./core) | Ports (`KhoraHostPersistence`, invites), client, in-memory fakes, row codecs, id conventions, **strategy contract suite** (`contract.ts`) | `@khoralabs/khora-host/persistence` |
| [`./core/schema`](./core/schema) | Shared SQL DDL (internal; used by sqlite only) | — |
| [`./sqlite`](./sqlite) | Bun SQLite adapter | `@khoralabs/khora-host/sqlite` |
| [`./testing`](./testing) | Re-exports `runHostPersistenceContractTests` | `@khoralabs/khora-host/testing` |

Backends apply schema via `ensure*` helpers over shared DDL in `./core/schema`. Wire codecs live in `./core/row-map.ts`.

## Validate strategies

Call `runHostPersistenceContractTests(name, factory)` from each backend’s `contract.test.ts` (same pattern as percolator / colonnade). The factory returns a harness `{ persistence, invites }`. The suite asserts port invariants so in-memory and sqlite stay aligned.

```ts
import { runHostPersistenceContractTests } from "@khoralabs/khora-host/testing";

runHostPersistenceContractTests("my-backend", () => ({
  persistence: openMyHostPersistence(),
  invites: openMyInvitesRepo(),
}));
```

`PrincipalLifecycle` orchestration stays on the product root (`createPrincipalLifecycle`); it is not a storage port.
