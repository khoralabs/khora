# Percolator persistence implementor’s guide

Contract for standing-query storage. Types: `@khoralabs/percolator/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`../core`](../core) | **Product API** — engine, types, filters, scoring | `@khoralabs/percolator` |
| [`./core`](./core) | `PercolatorPersistence` port + in-memory fake + shared row codecs | `@khoralabs/percolator/persistence` |
| [`./core/schema`](./core/schema) | Shared SQL DDL (internal; used by sqlite/turso only) | — |
| [`./sqlite`](./sqlite) | Bun SQLite adapter | `@khoralabs/percolator/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso adapter | `@khoralabs/percolator/turso-serverless` |
| [`./testing`](./testing) | `runPercolatorPersistenceContractTests` | `@khoralabs/percolator/testing` |

Backends apply schema via `ensure*` helpers over shared DDL in `./core/schema`. Wire codecs live in `./core/row-map.ts`.
