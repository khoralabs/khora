# Colonnade

**Colonnade** specifies a federated persistence architecture: a **central catalog** for discovery and selective indexing, **cells** (sharded stores) each with an authoritative **outbox** and a **drainable inbox**, plus a **router** that feeds **per-cell write logs** for serialized writers.

This package (`@khoralabs/colonnade`) holds the **Smithy model** (`spec/model/`) and TypeScript implementation under `src/`:

| Export | Path | Role |
|--------|------|------|
| `@khoralabs/colonnade` | [`src/core`](src/core) | Router, clients, routing, shared DDL, in-memory fakes |
| `@khoralabs/colonnade/persistence` | [`src/persistence`](src/persistence) | `CatalogPersistence`, `CellPersistence` contracts |
| `@khoralabs/colonnade/crypto` | [`src/crypto`](src/crypto) | DB open / payload codec helpers |
| `@khoralabs/colonnade/sqlite` | [`src/sqlite`](src/sqlite) | Local SQLCipher cell files + catalog SQLite |
| `@khoralabs/colonnade/turso-serverless` | [`src/turso-serverless`](src/turso-serverless) | Turso Cloud (one DB per cell shard) |
| `@khoralabs/colonnade/testing` | [`src/testing`](src/testing) | Contract test helpers |

See [`src/IMPLEMENTORS.md`](src/IMPLEMENTORS.md) for the adapter contract.

## TypeScript usage

```ts
import { ColonnadePublicationClient } from "@khoralabs/colonnade";
import type { CatalogPersistence, CellPersistence } from "@khoralabs/colonnade/persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade/sqlite";
```

**SQLite topology:** `createSqliteColonnadeCluster` opens lazy cell DBs at `{cellsDirectory}/{stem}.sqlite`. Pool routing uses **`derivePoolHomeCell(principal_id, cellCount)`**. Optional **`useCellWorkers: true`** runs each cell SQLite connection inside a Bun **`Worker`**.

**Turso topology:** `createTursoColonnadeCluster` opens one Turso database per cell shard via **`cells.urlTemplate`**.

```bash
cd packages/khora/colonnade && bun test && bun run typecheck
```

### Benchmarks

```bash
cd packages/khora/colonnade && bun run bench
cd packages/khora/colonnade && bun run bench -- --json
```

## Spec layout

| Path | Role |
| --- | --- |
| [`spec/model/shapes.smithy`](spec/model/shapes.smithy) | Shared identifiers, content hashes, pointer/inbox unions |
| [`spec/model/catalog.smithy`](spec/model/catalog.smithy) | `CatalogIndex` |
| [`spec/model/cell.smithy`](spec/model/cell.smithy) | `CellStore` |
| [`spec/model/routing.smithy`](spec/model/routing.smithy) | `ColonnadeRouter`, `CellWriteLog` |
| [`spec/model/post.smithy`](spec/model/post.smithy) | `PostOperation` |
