# @cfd/memories-sqlite

SQLite-backed implementation of the memories **persistence** contract (`MemoriesPersistence`): transactional merge/delete, hybrid lexical + vector search (with sqlite-vec), graph neighbors, and optional label-props search text. This is the **reference** store for parity with `@cfd/memories-core` and the Smithy persistence model.

## Exports

- **`createMemoriesPersistence(db, options?)`** — returns a sync `MemoriesPersistence` bound to a `bun:sqlite` `Database` opened with the memories schema (see `openMemoriesDatabase` in this package). Implements **`MemoriesGraph`** (reads + writes; topology reads are gated by `graphIndex`, default `true`).
- **Visualization / layout** — optional `createMemoriesVisualization` (mean embeddings + text/edge previews), `buildNamespaceGraphLayout` (UMAP + layout types in this package, using persistence + embedding SQL), and low-level `loadEdgePreview` / `loadMemoryTextPreview` / `loadMeanEmbeddingsForNamespace` helpers.
- **DB helpers** — `openMemoriesDatabase`, schema init, and related utilities for embedding / vec tables.

## Client usage

The sync **`MemoriesClient`** from `@cfd/memories-core` (not this package) takes `{ persistence }` where `persistence` is the object from `createMemoriesPersistence`. Async call sites that target Convex should use `@cfd/memories-convex` instead, which white-labels async APIs.

## Parity

Behavior is aligned with the shared row model and ops described in [`../IMPLEMENTORS.md`](../IMPLEMENTORS.md). For SQLite-specific merge/search/edge semantics, see [`IMPLEMENTORS.md`](./IMPLEMENTORS.md) in this package.
