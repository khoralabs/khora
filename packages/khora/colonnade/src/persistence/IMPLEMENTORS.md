# Colonnade persistence implementor’s guide

Operational contract for colonnade storage adapters. Types live in `@khoralabs/colonnade/persistence`.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`../core`](../core) | **Product API** — publication, router, pointer resolve, topology IDs, Smithy types | `@khoralabs/colonnade` |
| [`./core`](./core) | Storage contracts, fakes, port facades, wire codecs + **contract suite** (`contract.ts`) | `@khoralabs/colonnade/persistence` |
| [`./core/schema`](./core/schema) | Shared SQL DDL (internal; used by sqlite/turso only) | — |
| [`../crypto`](../crypto) | DB open / payload codec helpers | `@khoralabs/colonnade/crypto` |
| [`./sqlite`](./sqlite) | Bun SQLite adapters + `createSqliteColonnadeCluster` | `@khoralabs/colonnade/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso adapters + cluster factory | `@khoralabs/colonnade/turso-serverless` |
| [`./testing`](./testing) | Re-exports `runColonnadePersistenceContractTests` | `@khoralabs/colonnade/testing` |

Smithy models remain under [`../../spec`](../../spec).

## Contracts

- **`CatalogPersistence`** — discovery / indexing / pointer rows (formerly `CatalogPersistenceStrategy`).
- **`CellPersistence`** — per-cell outbox + inbox (formerly `CellPersistenceStrategy`).
- **`ResolveCell`** — `(cellId) => CellPersistence`.

Implementors should mirror the logical schema in each backend’s own schema/migrations tree. Shared DDL strings live in `./core/schema` and are not part of the public `@khoralabs/colonnade/persistence` export.

Backend test files call `runColonnadePersistenceContractTests` (defined in `./core/contract.ts`) so in-memory and sqlite stay aligned on catalog/cell invariants.
