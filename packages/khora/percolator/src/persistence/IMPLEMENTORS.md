# Percolator persistence implementor’s guide

Contract for standing-query storage. Types: `@khoralabs/percolator/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`../core`](../core) | **Product API** — engine, types, filters, scoring | `@khoralabs/percolator` |
| [`./core`](./core) | `PercolatorPersistence` port + in-memory fake + shared row codecs + **contract suite** (`contract.ts`) | `@khoralabs/percolator/persistence` |
| [`./core/schema`](./core/schema) | Shared SQL DDL (internal; used by sqlite/turso only) | — |
| [`./sqlite`](./sqlite) | Bun SQLite adapter | `@khoralabs/percolator/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso adapter | `@khoralabs/percolator/turso-serverless` |
| [`./testing`](./testing) | Re-exports `runPercolatorPersistenceContractTests` | `@khoralabs/percolator/testing` |

Backends apply schema via `ensure*` helpers over shared DDL in `./core/schema`. Wire codecs live in `./core/row-map.ts`.

Backend test files call `runPercolatorPersistenceContractTests` (defined in `./core/contract.ts`) so in-memory, sqlite, and turso stay aligned on port invariants.
