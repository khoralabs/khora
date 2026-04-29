# Memories persistence — implementor notes

This document compares backends under `packages/memories-persistence/` for anyone implementing or consuming `MemoriesPersistence` / `MemoriesPersistenceAsync` from `@cfd/memories-core`.

## Shared contract

- **Row model** — Defined in `@cfd/memories-core/persistence` (`memoriesPersistenceDocumentSchema`, row types). Business ids use `ids.*` / `stableId` from `@cfd/memories-core` (`models/ids.ts`), implemented with pure JS (`js-sha256`) so Node, Bun, and Convex bundles share one implementation.
- **Capabilities** — Backends set `MemoriesBackendCapabilities` (`lexicalSearch`, `vectorSearch`, `neighborIndex`, `graphIndex`, `multiNamespaceSearch`, `unscopedSearch`). Core merges or rejects features based on `resolveMemoriesBackendCapabilities`.
- **Graph** — `MemoriesGraph` in core types combines topology **reads** (`MemoriesGraphIndex`) and graph **writes** (`MemoriesGraphMutation`). `MemoriesPersistence` includes the full graph surface alongside `MemoriesMutationCore` (memory rows, features, search-meta). Per-entity reads: `loadNodeLabelsForMemory`, `loadNodePropertiesForMemory`, `loadGraphEdge` (see `@cfd/memories-spec` **MemoriesPersistenceService** graph operations).
- **Search** — `searchLexicalSourceMapIds` / `searchVectorSourceMapIds` return **rank-ordered** `source_map` ids (best first); hybrid merge uses RRF on ranks, not raw scores.

## SQLite (`@cfd/memories-sqlite`)

- **API** — Sync `MemoriesPersistence`; `withTransaction` maps to `db.transaction`.
- **Features** — Full lexical (FTS5), vector (sqlite-vec), neighbors, optional label-props search rebuild.
- **Docs** — [`sqlite/IMPLEMENTORS.md`](sqlite/IMPLEMENTORS.md), [`sqlite/README.md`](sqlite/README.md).

## Convex (`@cfd/memories-convex`)

- **API** — `MemoriesPersistenceAsync` via `createConvexMemoriesPersistence(client)`; public npm API also re-exports async client entry points (`MemoriesClient`, `mergeMemory`, …) without the `Async` suffix.
- **Capabilities** — Lexical + vector + graph reads: `vectorSearch: true`, `graphIndex: true`, `multiNamespaceSearch: true`. **`neighborIndex: true`** — `listNeighborsForMemory` mirrors SQLite-style filtering (incident edges → neighbor memories → `HydratedNeighbor` rows). **`unscopedSearch: true`** when lexical unscoped search index paths and vector unscoped search agree on semantics (see Convex README for scan/post-filter trade-offs). **`syncLabelPropsSearchFeatures`** — optional mutation + adapter hook after merge meta sync (same ordering intent as SQLite). **Embeddings** are restricted to widths in `CONVEX_VECTOR_DIMENSIONS`. `listVectorEmbeddingIndexDimensions` returns that **supported** set, not dimensions inferred from stored vectors (unlike SQLite).
- **Transactions — `mergeMemory` overloads** — **`MutationCtxAsync`** (`{ persistence }`): delegates to core `mergeMemoryAsync` → multiple Convex RPCs; **`withTransaction`** on the adapter is still a no-op for cross-RPC atomicity. **`MergeMemoryConvexAtomicCtx`** (`{ client, refs }`): one **`mergeMemoryAtomic`** component mutation — single DB transaction; **`ontology` on params is rejected** (not serializable through Convex validators). Latency vs atomicity: prefer overload A for parity with generic async callers; prefer overload B inside Convex mutations/actions when you need one transactional merge.
- **Docs** — [`convex/README.md`](convex/README.md). For SQLite vs Convex behavioral comparison (embeddings, meta vector, neighbors, transactions), see [`.idea/convex_sqlite_parity.md`](../../../.idea/convex_sqlite_parity.md).

## Choosing a backend

- Prefer **SQLite** for local single-process apps, tests, and maximum flexibility (continuous embedding widths, simplest local transactions).
- Prefer **Convex** for hosted sync/async clients and serverless deployments when the Convex capability matrix matches your needs (fixed embedding widths; use atomic `mergeMemory` overload when transactional merge matters).
