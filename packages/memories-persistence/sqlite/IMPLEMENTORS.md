# Memory persistence implementor’s guide

This document describes the **operational contract** for [`MemoriesPersistence`](../memories-core/src/persistence/types.ts). Method names and types live in `@cfd/memories-core`; behavior and ordering are specified here.

The reference SQLite implementation is [`./src/strategies/sqlite/persistence.ts`](./src/strategies/sqlite/persistence.ts). The wire model is also described in [`packages/memories-spec`](../memories-spec/model/persistence.smithy) (Smithy).

## Relational row shapes (Zod)

Canonical **table Zod schemas**, the composed document schema (`memoriesPersistenceDocumentSchema`), **row TypeScript types** (via `MemoriesPersistenceSchema` / `@cfd/memories-core/db/rows`), helpers (`zId`, `defineSchema`, `documentValidator`), and **vector payload** rules (`zVectorPayload`, 512–3072 floats) live in **`@cfd/memories-core/persistence`**. The reference SQLite strategy imports that package for DDL (`sqliteDdlFromSchema` in `./src/strategies/sqlite/_lib/sqlite-relational.ts`), insert-time `documentValidator` checks, and type alignment with core. TypeScript backends should use the same module so storage rows and merge-time validation stay aligned with `mergeMemory` / `MemoriesPersistence`.

## Smithy capability modules

[`persistence.smithy`](../memories-spec/model/persistence.smithy) defines **module** services (subsets of operations) plus a single aggregate **`MemoriesPersistenceService`** with the full operation list. Use modules to see what a minimal backend can omit; use the aggregate for a “full adapter” contract or codegen.

| Smithy service | Role | TypeScript (approx.) | When omitted / `MemoriesBackendCapabilities` |
| ---------------- | ---- | -------------------- | --------------------------------------------- |
| `MemoriesPersistenceCore` | Lexical mutation, catalog, edges, search-meta text path, lexical search, hydrate | [`MemoriesMutation`](../memories-core/src/persistence/types.ts) (minus vector + optional label-props sync) + lexical half of [`MemoriesRetrieval`](../memories-core/src/persistence/types.ts) | Baseline for any storage implementation. |
| `MemoriesPersistenceVector` | Vector features, meta-vector upsert, vector search, embedding dimensions | Vector methods on mutation/retrieval + `listVectorEmbeddingIndexDimensions` | Omit when `vectorSearch` is `false`. |
| `MemoriesPersistenceNeighbors` | Neighbor listing for search | [`MemoriesNeighborIndex`](../memories-core/src/persistence/types.ts) | Omit when `neighborIndex` is `false`. |
| `MemoriesPersistenceLabelProps` | `SyncLabelPropsSearchFeatures` | Optional `syncLabelPropsSearchFeatures?` on mutation | Omit if label-props search chunks are unsupported. |
| `MemoriesPersistenceReads` | Prefetch / export reads | [`MemoriesPersistenceReads`](../memories-core/src/persistence/types.ts) except `listVectorEmbeddingIndexDimensions` (that method is grouped under **Vector** in Smithy) | Thin stores may skip; most backends implement with Core. |

Graph **visualization** routes ([`MemoriesVisualization`](../memories-core/src/persistence/types.ts)) are **not** part of the persistence Smithy model; they are a separate read adapter. See [Visualization (optional)](#visualization-optional) below.

## ID conventions

Stable string primary keys are derived in [`../memories-core/src/models/ids.ts`](../memories-core/src/models/ids.ts). The logic layer uses:

- `ids.memory(namespace, key)` and `ids.node(namespace, key)` for the primary memory row and its graph node.
- `ids.nodeLabel(kind)` / `ids.edgeLabel(kind)` hash the **catalog kind string only** (not assignment props).
- `ids.nodeLabelAssignment(nodeId, labelId)` and `ids.edgeLabelAssignment(edgeId, labelId)` are stable under **one assignment row per (node, label)** and **(edge, label)**.

Implementations must use the same derivation if they need to match the reference store.

## Ontology labels: catalog vs assignments

- **Catalog** (`node_labels`, `edge_labels`): one row per **label kind**. Columns: **`kind`**, **`description`**, optional **`schema`** (JSON text: JSON Schema for that kind’s `props`, often exported from Zod via `z.toJSONSchema()`).
- **Assignments** (`node_label_assignments`, `edge_label_assignments`): one row per **(entity, catalog label)**; store **`props`** as JSON (object). Upserts replace props on re-merge.

Merge callers pass structured `{ kind, props }` (see [`MergeMemoryParams`](../memories-core/src/api/merge-memory.ts)); the reference store **optionally** validates `props` with **Ajv** against the catalog `schema` when `schema` is non-null (root `$schema` from Zod is stripped before compile—see `validate-props.ts`).

## Transactions: `withTransaction`

- **Purpose:** All merge and delete mutations run inside a single transaction.
- **Reference (SQLite):** Implemented as `db.transaction(fn)()`. On uncaught exception, SQLite rolls back the transaction.
- **Nested calls:** Avoid nesting `withTransaction` unless your driver documents safe re-entrancy; the reference path does not nest.
- **Async / remote:** For backends that need asynchronous commits, see [`MemoriesPersistenceAsync`](../memories-core/src/persistence/async-types.ts) and async entry points (`mergeMemoryAsync`, `searchAsync`, `deleteMemoryAsync`, `MemoriesClientAsync`).

## `clearMemorySubtree` vs `deleteMemoryRootRows`

- **`clearMemorySubtree`:** Removes dependent data for a memory (source maps, text/vector features, FTS rows, vector index rows, edges touching the subtree, label assignments, search-meta rows, etc.) while the implementation may still expect `memories` / `nodes` root rows to exist for the next steps in the same transaction. See reference `clearMemorySubtree` in this package.
- **`deleteMemoryRootRows`:** Deletes the root `memories` and `nodes` rows (used at the end of `deleteMemory`).
- **Idempotency:** `deleteMemory` should be safe if the memory was already absent (reference clears then deletes roots).

## Content: source maps and features

- One **source map** per merge content item `key` (user `source_key`).
- **Text:** `insertLexicalFeature` ties searchable text to that source map; lexical search returns `source_map` ids.
- **Vector:** `insertVectorFeature` stores a `Float32Array`; **query vectors in search must use the same dimensionality** as stored vectors for the vector arm to return hits.
- If `MemoriesBackendCapabilities.vectorSearch` is `false`, the logic layer rejects merge items that include `vector` and skips the vector search arm (see capabilities below).

## Edges

- **`insertEdge`:** `idParts.label` must be the **edge label kind** (string), together with `selfMemoryKey` / `otherMemoryKey`, so `ids.edge(...)` stays stable for the same directed link identity.
- After inserting an edge, callers **`ensureEdgeLabel`** (catalog) then **`insertEdgeLabelAssignment`** with **`props`** for that kind on that edge.

## Search arms and ranking

- `searchLexicalSourceMapIds` and `searchVectorSourceMapIds` return **ordered lists of `source_map` ids** (best-first). There is **no separate score contract**: [`fuseRrf`](https://github.com/reciprocal-rank-fusion) uses **rank position** and configured arm weights only.
- **Namespace scope:** Both methods take a discriminated **`scope: SearchNamespaceScope`** instead of a single `namespace` string:
  - `{ kind: "union"; namespaces: readonly string[] }` — non-empty, deduped list; implement **one** retrieval pass with `namespace IN (...)` (or equivalent), or return only the first id if you intentionally support single-namespace only (core will use a per-namespace fallback when `multiNamespaceSearch` is `false`).
  - `{ kind: "unscoped" }` — no namespace predicate on retrieval (entire DB). Only used when the app sets `searchEntireDatabase: true` on [`SearchParams`](../memories-core/src/api/search.ts); reject at the API layer by leaving `unscopedSearch` as `false`.
- **Hydration:** `hydrateSourceMapHits` expands ids to full [`HydratedSourceMapHit`](../memories-core/src/models/neighbor-search-types.ts) rows: each hit includes **`labels: { kind, props }[]`** (ontology instances), aligned with [`db/rows`](../memories-core/src/db/rows.ts) / catalog joins.

## Neighbors

- `listNeighborsForMemory` returns graph neighbors for a memory `key`, optionally filtered by [`NeighborFilter`](../memories-core/src/models/neighbor-search-types.ts) (edge kinds, directions, node-label kinds on the neighbor).
- Each row includes **`labels`** as structured instances and **`edge.label`** as a single `{ kind, props }` for the chosen incident edge label (when multiple kinds exist on one edge, the reference filters/picks per constraint).
- When `neighborIndex` capability is `false`, search **ignores** neighbor expansion (treats `neighbors` option as off).
- Neighbor **sub-search** reuses the same lexical/vector arms, scoped to neighbor memory ids.

## Backend capabilities

Optional property on the persistence object:

```ts
capabilities?: Partial<MemoriesBackendCapabilities>;
```

[`resolveMemoriesBackendCapabilities`](../memories-core/src/persistence/types.ts) merges with [`DEFAULT_MEMORIES_BACKEND_CAPABILITIES`](../memories-core/src/persistence/types.ts) (lexical, vector, neighbor, and multi-namespace search on; **unscoped** off). Set flags to declare MVP backends:

| Flag | When `false`, logic layer … |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `lexicalSearch`         | Skips lexical arm; merge with text-only content may still run if you implement FTS no-ops. |
| `vectorSearch`          | Skips vector arm; **rejects** merge content items with `vector`; vector-only search returns `[]`. |
| `neighborIndex`         | Skips neighbor listing and expansion in search.                                            |
| `multiNamespaceSearch` | For hybrid search with **multiple** namespaces in `scope`, runs **separate** per-namespace retrieval calls and merges with RRF in core (no need to implement `IN` lists yourself). |
| `unscopedSearch`        | **`searchEntireDatabase`** on `SearchParams` throws; `scope: { kind: "unscoped" }` is not used. |

Thin adapters that only support one namespace per query should set **`multiNamespaceSearch: false`**; core still works via the fallback path.

## Search-meta (hybrid chunk)

- Reserved `source_key`: [`MEMORY_SEARCH_META_SOURCE_KEY`](../memories-core/src/search-meta-constants.ts) (`__mem_search_meta__`).
- `syncMemorySearchMeta` rebuilds canonical text for the meta chunk from **node label kinds** and **incident edge kinds** (topology line); optional `metaVector` on the primary memory during merge.
- Merge pipeline: [`upsertMemorySearchMetaVector`](../memories-core/src/persistence/facade.ts) updates vectors for multiple keys in a transaction. The `@cfd/memories-core/helpers` function `mergeLogicalMemoryWithMergeSlice` **skips** this batch entirely when `vectorSearch` is `false` (no embed RPC). If you need vectors stored without vector retrieval, extend the caller. Reference SQLite expects vector search for meta retrieval.

## Label-props search chunks (optional)

- **Purpose:** Lexical index for **ontology `props`** on node and edge label **assignments** without stuffing raw JSON into the topology meta line. Topology meta (`node:…` / `edge …`) still lists **kinds** only.
- **Reserved keys:** [`memoryNodeLabelPropsSourceKey`](../memories-core/src/search-meta-constants.ts) (`__mem_nl_props__/…`) per `node_label_assignments._id`, and [`memoryEdgeLabelPropsSourceKey`](../memories-core/src/search-meta-constants.ts) (`__mem_edge_props__/…`) per **`edge_label_assignments._id`** (one chunk per assignment with non-empty props), on **each** endpoint memory.
- **Contract:** [`syncLabelPropsSearchFeatures?`](../memories-core/src/persistence/types.ts) runs after `syncMemorySearchMeta` for each memory key in the merge invalidation set (see `mergeMemory`). It should **remove** prior `__mem_nl_props__*` / `__mem_edge_props__*` `source_map` rows for that memory, then insert fresh `text_features` (+ FTS) from **`kind` + `props`** on assignment rows (join catalog for `kind` if stored only by `label_id`).
- **Human-readable text:** Use [`formatLabelPropsForSearch`](../memories-core/src/models/label-props-search-text.ts) with an optional per-app [`LabelPropsSearchFormatter`](../memories-core/src/models/label-props-search-text.ts). Reference SQLite passes an optional formatter from [`createMemoriesPersistence`](./src/strategies/sqlite/persistence.ts) options.
- **Vectors:** Not indexed on these chunks in v1 (optional follow-up).

## Visualization (optional)

Implementors may expose [`MemoriesVisualization`](../memories-core/src/persistence/types.ts): graph edges and previews carry **`labels: { kind, props }[]`** for nodes and edges. The SQLite strategy implements this in [`./src/strategies/sqlite/visualization/`](./src/strategies/sqlite/visualization/).

## Async persistence

[`MemoriesPersistenceAsync`](../memories-core/src/persistence/async-types.ts) mirrors the sync interface with `Promise`-returning methods and `withTransaction(fn: () => Promise<T>): Promise<T>`. Use `MemoriesClientAsync` and `mergeMemoryAsync` / `searchAsync` / `deleteMemoryAsync` when implementing remote or non-blocking stores.

**Note:** `wrapSyncMemoriesPersistenceAsAsync` does not support a real async transaction—use native async backends for `mergeMemoryAsync` inside `withTransaction`.
