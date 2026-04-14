# Memories persistence — implementor notes

This document compares backends under `packages/memories-persistence/` for anyone implementing or consuming `MemoriesPersistence` / `MemoriesPersistenceAsync` from `@cfd/memories-core`.

## Shared contract

- **Row model** — Defined in `@cfd/memories-core/persistence` (`memoriesPersistenceDocumentSchema`, row types). Business ids use `ids.*` / `stableId` from `@cfd/memories-core` (`models/ids.ts`), implemented with pure JS (`js-sha256`) so Node, Bun, and Convex bundles share one implementation.
- **Capabilities** — Backends set `MemoriesBackendCapabilities` (`lexicalSearch`, `vectorSearch`, `neighborIndex`, `multiNamespaceSearch`, `unscopedSearch`). Core merges or rejects features based on `resolveMemoriesBackendCapabilities`.
- **Search** — `searchLexicalSourceMapIds` / `searchVectorSourceMapIds` return **rank-ordered** `source_map` ids (best first); hybrid merge uses RRF on ranks, not raw scores.

## SQLite (`@cfd/memories-sqlite`)

- **API** — Sync `MemoriesPersistence`; `withTransaction` maps to `db.transaction`.
- **Features** — Full lexical (FTS5), vector (sqlite-vec), neighbors, optional label-props search rebuild.
- **Docs** — [`sqlite/IMPLEMENTORS.md`](sqlite/IMPLEMENTORS.md), [`sqlite/README.md`](sqlite/README.md).

## Convex (`@cfd/memories-convex`)

- **API** — `MemoriesPersistenceAsync` via `createConvexMemoriesPersistence(client)`; public npm API also re-exports async client entry points (`MemoriesClient`, `mergeMemory`, …) without the `Async` suffix.
- **Milestone** — Lexical-first: `vectorSearch: false`, `neighborIndex: false`, `unscopedSearch: false`. Vector and neighbor methods are stubs or throw as appropriate.
- **Transactions** — Adapter `withTransaction` does **not** batch RPCs; each mutation is atomic on the server, but a full merge is not one transaction unless you add a dedicated batched mutation.
- **Docs** — [`convex/README.md`](convex/README.md).

## Choosing a backend

- Prefer **SQLite** for local single-process apps, tests, and full vector + neighbor support.
- Prefer **Convex** for hosted sync/async clients and serverless deployments when lexical-first is enough for your milestone.
