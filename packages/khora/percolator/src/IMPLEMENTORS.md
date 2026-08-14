# Percolator persistence implementor’s guide

Contract for standing-query storage. Types: `@khoralabs/percolator/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| Engine + types | Matching logic, in-memory persistence | `@khoralabs/percolator` |
| [`./persistence`](./persistence) | `PercolatorPersistence` port | `@khoralabs/percolator/persistence` |
| [`./sqlite`](./sqlite) | Bun SQLite adapter | `@khoralabs/percolator/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso adapter | `@khoralabs/percolator/turso-serverless` |
| [`./testing`](./testing) | `runPercolatorPersistenceContractTests` | `@khoralabs/percolator/testing` |

Backends own schema DDL; shared query JSON mapping stays driver-free in the engine package.
