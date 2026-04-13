# Memory persistence implementor’s guide

This document describes the **operational contract** for [`MemoriesPersistence`](src/persistence/types.ts). Method names and types live in code; behavior and ordering are specified here. The reference implementation is [`@cfd/memories-core-persistence/sqlite`](../memories-persistence/src/strategies/sqlite/persistence.ts).

## ID conventions

Stable string primary keys are derived in [`src/models/ids.ts`](src/models/ids.ts). The logic layer uses:

- `ids.memory(namespace, key)` and `ids.node(namespace, key)` for the primary memory row and its graph node.
- Other ids (`sourceMap`, `textFeature`, etc.) are deterministic from parent ids and keys.

Implementations must use the same derivation if they need to match the reference store.

## Transactions: `withTransaction`

- **Purpose:** All merge and delete mutations run inside a single transaction.
- **Reference (SQLite):** Implemented as `db.transaction(fn)()`. On uncaught exception, SQLite rolls back the transaction.
- **Nested calls:** Avoid nesting `withTransaction` unless your driver documents safe re-entrancy; the reference path does not nest.
- **Async / remote:** For backends that need asynchronous commits, see [`MemoriesPersistenceAsync`](src/persistence/async-types.ts) and async entry points (`mergeMemoryAsync`, `searchAsync`, `deleteMemoryAsync`, `MemoriesClientAsync`).

## `clearMemorySubtree` vs `deleteMemoryRootRows`

- **`clearMemorySubtree`:** Removes dependent data for a memory (source maps, text/vector features, FTS rows, vector index rows, edges touching the subtree, label assignments, search-meta rows, etc.) while the implementation may still expect `memories` / `nodes` root rows to exist for the next steps in the same transaction. See reference `clearMemorySubtree` in memories-persistence.
- **`deleteMemoryRootRows`:** Deletes the root `memories` and `nodes` rows (used at the end of `deleteMemory`).
- **Idempotency:** `deleteMemory` should be safe if the memory was already absent (reference clears then deletes roots).

## Content: source maps and features

- One **source map** per merge content item `key` (user `source_key`).
- **Text:** `insertLexicalFeature` ties searchable text to that source map; lexical search returns `source_map` ids.
- **Vector:** `insertVectorFeature` stores a `Float32Array`; **query vectors in search must use the same dimensionality** as stored vectors for the vector arm to return hits.
- If `MemoriesBackendCapabilities.vectorSearch` is `false`, the logic layer rejects merge items that include `vector` and skips the vector search arm (see capabilities below).

## Search arms and ranking

- `searchLexicalSourceMapIds` and `searchVectorSourceMapIds` return **ordered lists of `source_map` ids** (best-first). There is **no separate score contract**: [`fuseRrf`](https://github.com/reciprocal-rank-fusion) uses **rank position** and configured arm weights only.
- **Namespace scope:** Both methods take a discriminated **`scope: SearchNamespaceScope`** instead of a single `namespace` string:
  - `{ kind: "union"; namespaces: readonly string[] }` — non-empty, deduped list; implement **one** retrieval pass with `namespace IN (...)` (or equivalent), or return only the first id if you intentionally support single-namespace only (core will use a per-namespace fallback when `multiNamespaceSearch` is `false`).
  - `{ kind: "unscoped" }` — no namespace predicate on retrieval (entire DB). Only used when the app sets `searchEntireDatabase: true` on [`SearchParams`](src/api/search.ts); reject at the API layer by leaving `unscopedSearch` as `false`.
- **Hydration:** `hydrateSourceMapHits` expands ids to full [`HydratedSourceMapHit`](src/models/neighbor-search-types.ts) rows aligned with [`db/rows`](src/db/rows.ts).

## Neighbors

- `listNeighborsForMemory` returns graph neighbors for a memory `key`, optionally filtered by [`NeighborFilter`](src/models/neighbor-search-types.ts) (edge kinds, directions, node labels).
- When `neighborIndex` capability is `false`, search **ignores** neighbor expansion (treats `neighbors` option as off).
- Neighbor **sub-search** reuses the same lexical/vector arms, scoped to neighbor memory ids.

## Backend capabilities

Optional property on the persistence object:

```ts
capabilities?: Partial<MemoriesBackendCapabilities>;
```

[`resolveMemoriesBackendCapabilities`](src/persistence/types.ts) merges with [`DEFAULT_MEMORIES_BACKEND_CAPABILITIES`](src/persistence/types.ts) (lexical, vector, neighbor, and multi-namespace search on; **unscoped** off). Set flags to declare MVP backends:

| Flag | When `false`, logic layer … |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `lexicalSearch`         | Skips lexical arm; merge with text-only content may still run if you implement FTS no-ops. |
| `vectorSearch`          | Skips vector arm; **rejects** merge content items with `vector`; vector-only search returns `[]`. |
| `neighborIndex`         | Skips neighbor listing and expansion in search.                                            |
| `multiNamespaceSearch` | For hybrid search with **multiple** namespaces in `scope`, runs **separate** per-namespace retrieval calls and merges with RRF in core (no need to implement `IN` lists yourself). |
| `unscopedSearch`        | **`searchEntireDatabase`** on `SearchParams` throws; `scope: { kind: "unscoped" }` is not used. |

Thin adapters that only support one namespace per query should set **`multiNamespaceSearch: false`**; core still works via the fallback path.

## Search-meta (hybrid chunk)

- Reserved `source_key`: [`MEMORY_SEARCH_META_SOURCE_KEY`](src/models/memory-search-meta.ts).
- `syncMemorySearchMeta` rebuilds canonical text for the meta chunk; optional `metaVector` on the primary memory during merge.
- Merge pipeline: [`upsertMemorySearchMetaVector`](src/persistence/facade.ts) updates vectors for multiple keys in a transaction. The `@cfd/memories-core/helpers` function `mergeLogicalMemoryWithMergeSlice` **skips** this batch entirely when `vectorSearch` is `false` (no embed RPC). If you need vectors stored without vector retrieval, extend the caller. Reference SQLite expects vector search for meta retrieval.

## Label-props search chunks (optional)

- **Purpose:** Lexical index for **ontology `props`** on node and edge labels without stuffing raw JSON into the topology meta line. Topology meta (`node:…` / `edge …`) stays as today.
- **Reserved keys:** [`memoryNodeLabelPropsSourceKey`](src/search-meta-constants.ts) (`__mem_nl_props__/…`) per `node_label_assignments._id`, and [`memoryEdgeLabelPropsSourceKey`](src/search-meta-constants.ts) (`__mem_edge_props__/…`) per `edges._id` on **each** endpoint memory.
- **Contract:** [`syncLabelPropsSearchFeatures?`](src/persistence/types.ts) runs after `syncMemorySearchMeta` for each memory key in the merge invalidation set (see `mergeMemory`). It should **remove** prior `__mem_nl_props__*` / `__mem_edge_props__*` `source_map` rows for that memory, then insert fresh `text_features` (+ FTS) from parsed stored label values (`parseOntologyLabelValue`).
- **Human-readable text:** Use [`formatLabelPropsForSearch`](src/models/label-props-search-text.ts) with an optional per-app [`LabelPropsSearchFormatter`](src/models/label-props-search-text.ts). Reference SQLite passes an optional formatter from [`createMemoriesPersistence`](../memories-persistence/src/strategies/sqlite/persistence.ts) options.
- **Vectors:** Not indexed on these chunks in v1 (optional follow-up).

## Async persistence

[`MemoriesPersistenceAsync`](src/persistence/async-types.ts) mirrors the sync interface with `Promise`-returning methods and `withTransaction(fn: () => Promise<T>): Promise<T>`. Use `MemoriesClientAsync` and `mergeMemoryAsync` / `searchAsync` / `deleteMemoryAsync` when implementing remote or non-blocking stores.
