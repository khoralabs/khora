---
name: Swarm host memory search
overview: Move hybrid memory search pipeline into @cfd/memories-core/helpers (neutral types + AI SDK EmbeddingModel); SwarmHost exposes search using only memories-core; @cfd/memories-tools keeps Zod + tool wiring atop core; Atrium uses memories-core/helpers for embed + merges and never imports memories-tools.
todos:
  - id: core-search-pipeline
    content: "memories-core/helpers: add memory-search pipeline module(s) — types, cache key, neighbor/options mapping, slim hits, runHybridMemorySearch; export from helpers/index"
    status: completed
  - id: memories-tools-thin
    content: "memories-tools: delegate to core pipeline; keep zMemorySearchToolInput + MemorySearchEnv (budget/extensions); remove duplicate embedding-types + embedding-text — re-export EmbeddingModel/embedTextChunks from @cfd/memories-core/helpers for compat"
    status: completed
  - id: swarm-host-search
    content: "swarm-host: optional embeddingModel from memories-core/helpers; searchMemories + event ctx; no @cfd/memories-tools dep; re-export search types from core if useful"
    status: completed
  - id: async-map-memory-ops
    content: "swarm-host: SwarmMemoryOpMapper returns Promise ops; createSwarmMemoriesSyncHandler awaits"
    status: completed
  - id: atrium-core-only
    content: "atrium host: optional EmbeddingModel via createMemoriesEmbeddingModel / embedTextChunks from @cfd/memories-core/helpers only; async mapMemoryOps with text+vector"
    status: pending
  - id: verify
    content: typecheck memories-core, memories-tools, swarm-host, atrium; bun test tools; biome
    status: pending
isProject: false
---

# Swarm host memory search (revised)

## Design principles

1. **Pluggable embeddings via AI SDK** — Host and apps use [`EmbeddingModel`](packages/memories/core/src/helpers/embedding-model.ts) and [`createMemoriesEmbeddingModel`](packages/memories/core/src/helpers/embedding-model.ts) from **`@cfd/memories-core/helpers`** (wraps `ai` `embedMany` / model handle). No second embedding abstraction in swarm-host.

2. **Neutral search pipeline in memories-core** — Extract from [`memory-search-toolkit.ts`](packages/memories/agents/tools/src/memory-search-toolkit.ts) everything that is **not** Zod or agent-identity into new **`@cfd/memories-core/helpers`** modules (e.g. [`helpers/memory-search-pipeline.ts`](packages/memories/core/src/helpers/memory-search-pipeline.ts), or split `*-types.ts` if needed):

   - Types: slim **`MemorySearchHit`**, a neutral **`HybridMemorySearchInput`** (query text + optional structured options equivalent to current tool options: `topK`, `minScore`, `labels`, `neighbors`, `maxNeighbors`, `arms`, `maxVectorDistance`).
   - Helpers: **`embeddingCacheKey`**, **`neighborOptionForSearch`** (typed on neutral union, not `z.infer`), **`mapSearchHits`** / internal mapping from **`SearchHit`**.
   - **`resolveAsOfTimestampMs`** from persistence snapshot hex (same behavior as current private helper in toolkit).
   - **`runHybridMemorySearch`** (name TBD): takes wide **`MemoriesClient`** (or minimal search surface), **`HybridMemorySearchContext`** (`namespace`, `additionalNamespaces`, optional **`embeddingModel`**, optional **`embeddingCache`**, optional **`memoriesSnapshotRootHex`**), and **`HybridMemorySearchInput`**; returns **`Promise<MemorySearchHit[]>`**. Implements the current handler logic (arm weights, require model when vector arm &gt; 0, embed + cache, build **`SearchContent`**, call **`client.search`**, map hits).

3. **memories-tools stays agent-facing only** — [`zMemorySearchToolInput`](packages/memories/agents/tools/src/memory-search-toolkit.ts) parses agent JSON → **`HybridMemorySearchInput`** (explicit mapper or `z.transform`). **`memory_search` tool** calls **`runHybridMemorySearch`**. **`MemorySearchEnv`** remains here (budget, `memorySearchExtensions`, toolkit identity) but **`embeddingModel` type** comes from **`@cfd/memories-core/helpers`**. Delete duplicate **[`embedding-types.ts`](packages/memories/agents/tools/src/embedding-types.ts)** / **[`embedding-text.ts`](packages/memories/agents/tools/src/embedding-text.ts)**; **`index.ts`** may **re-export** `EmbeddingModel`, `embedTextChunks`, `createMemoriesEmbeddingModel`, etc. from **`@cfd/memories-core/helpers`** so existing agent callers keep working.

4. **SwarmHost depends only on `@cfd/memories-core`** — Optional **`embeddingModel?: EmbeddingModel`** on **`SwarmHostDeps`** (import from **`@cfd/memories-core/helpers`**). **`searchMemories`** / event-ctx handle builds **`HybridMemorySearchContext`** from host state + call args and invokes **`runHybridMemorySearch`**. **Do not add `@cfd/memories-tools`** to [`packages/swarm/host/package.json`](packages/swarm/host/package.json).

5. **Atrium never imports `@cfd/memories-tools`** — Configuration accepts an optional **`EmbeddingModel`** (callers construct with `createMemoriesEmbeddingModel({ model: openai.embedding(...) })` or equivalent). Async **`mapMemoryOps`** uses **`embedTextChunks`** from **`@cfd/memories-core/helpers`** only.

## Async memory-op mapper

- Same as prior plan: **`SwarmMemoryOpMapper`** may return **`Promise<SwarmMemoryOp[]>`**; **`createSwarmMemoriesSyncHandler`** awaits before **`mergeMemory`/`deleteMemory`**.

## Verification

- Typecheck: **`packages/memories/core`**, **`packages/memories/agents/tools`**, **`packages/swarm/host`**, **`apps/atrium/host`**.
- **`bun test`** under **`packages/memories/agents/tools`**.
- Biome on touched files.

## Optional follow-up

- HTTP **`POST /v1/.../search`** on Atrium — thin handler validating JSON into **`HybridMemorySearchInput`** (or inline shape) and calling **`host.searchMemories`**.
