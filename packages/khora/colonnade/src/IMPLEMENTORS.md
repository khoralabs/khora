# Colonnade persistence implementor’s guide

Operational contract for colonnade storage adapters. Types live in `@khoralabs/colonnade/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`./core`](./core) | Router, publication client, in-memory fakes, shared DDL helpers | `@khoralabs/colonnade` |
| [`./persistence`](./persistence) | `CatalogPersistence`, `CellPersistence` contracts | `@khoralabs/colonnade/persistence` |
| [`./crypto`](./crypto) | DB open / payload codec helpers | `@khoralabs/colonnade/crypto` |
| [`./sqlite`](./sqlite) | Bun SQLite adapters + `createSqliteColonnadeCluster` | `@khoralabs/colonnade/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso adapters + cluster factory | `@khoralabs/colonnade/turso-serverless` |
| [`./testing`](./testing) | Shared contract test helpers | `@khoralabs/colonnade/testing` |

Smithy models remain under [`../spec`](../spec).

## Contracts

- **`CatalogPersistence`** — discovery / indexing / pointer rows (formerly `CatalogPersistenceStrategy`).
- **`CellPersistence`** — per-cell outbox + inbox (formerly `CellPersistenceStrategy`).
- **`ResolveCell`** — `(cellId) => CellPersistence`.

Implementors should mirror the logical schema in each backend’s own schema/migrations tree and keep shared helpers in `core/`.
