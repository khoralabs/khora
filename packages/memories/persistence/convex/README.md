# @khoralabs/memories-convex

Convex **component** and TypeScript client for the Smithy-aligned memories persistence surface (**lexical search first**). It implements `MemoriesPersistenceAsync` via Convex queries/mutations under `src/component/`, and re-exports the async-first **memories client API** from `@khoralabs/memories-core` under primary names (`MemoriesClient`, `mergeMemory`, `search`, `deleteMemory`) so call sites stay readable without an `Async` suffix. **Sync** `MemoriesClient` / `mergeMemory` / `search` from core are not re-exported.

## Capabilities

| Feature | Supported |
|--------|-----------|
| Lexical search | Yes (Convex search index on `text_features.text`; subtree filters use `nsPrefix1`…`nsPrefix6`) |
| Vector search | Yes (`vectorSearch: true`; KNN via `ctx.vectorSearch` in component **action** `searchVectorSourceMapIds`; embeddings stored per dimension in `vector_features_768` / `_1024` / `_1536` / `_3072`) |
| Graph index (topology reads) | Yes (`graphIndex: true`; `loadGraphEdgesForNamespace`, incident edges, node labels/properties, `loadGraphEdge`, `loadGraphNode` via component queries) |
| Neighbor index | Yes (`neighborIndex: true`; `listNeighborsForMemory` with optional Convex `filters`, aligned with core neighbor semantics) |
| Multi-namespace search | Yes (`multiNamespaceSearch: true`; per-namespace arms merged round-robin) |
| Unscoped search | Yes (`unscopedSearch: true`; lexical via search index without namespace filter where applicable; vector via unscoped vector search path — consider limits/cost at scale) |
| `syncLabelPropsSearchFeatures` | Yes (optional adapter hook + component mutation; runs after `syncMemorySearchMeta` for touched keys on merge, matching merge order intent) |

**Embedding widths:** Only the dimensions in `CONVEX_VECTOR_DIMENSIONS` (re-exported from this package) are valid for inserts and search. `listVectorEmbeddingIndexDimensions` returns that **fixed supported list**, not “dimensions currently present in the database” (SQLite’s reference backend infers from materialized vec tables).

Hierarchical namespaces use **cumulative prefix** columns (`nsPrefix_k` = first *k* segments joined with `/`) on `text_features` and `vector_features_*` so a subtree query is a single `eq` per root (Convex vector filters allow only `eq` + `or`, not chained `and` across fields). See [`src/component/lib/vectorConfig.ts`](src/component/lib/vectorConfig.ts) for the canonical width list.

**Hybrid / vector retrieval:** Callers must supply a Convex client that implements **`action`** (e.g. `ctx.runAction` from an action, or the client’s action runner). Lexical-only `search()` can use query + mutation only; vector arms use the component action.

`MemoriesPersistenceAsync` is still exported under its **real** name. Do not confuse it with sync `MemoriesPersistence` from core.

## Install

In a monorepo workspace:

```bash
bun add @khoralabs/memories-convex
```

Add this package as a Convex component per [Convex Components](https://docs.convex.dev/components). The component root is `src/component/` (`convex.config.ts`, `schema.ts`, queries/mutations, and `src/component/_generated/`).

**Packaged components** do not get regenerated from a host app’s `convex dev` alone. After changing component functions or schema, run codegen from **this package** (same pattern as [@very-coffee/convex-facts](https://github.com/coffee-fueled-dev/agent/tree/main/packages/convex-facts)):

```bash
bun run codegen
```

This runs `convex codegen --component-dir ./src/component`. It needs a Convex deployment context (e.g. `CONVEX_DEPLOYMENT` or a local `convex dev` / backend as required by your Convex CLI version). Commit updated files under `src/component/_generated/`.

Hosts import the component config as:

```ts
import memories from "@khoralabs/memories-convex/convex.config.js";
```

## Usage

1. Deploy or run Convex with this package’s component (`src/component`) available to the backend via `app.use` and the `convex.config` export.
2. Create an HTTP or React client (`ConvexHttpClient` from `convex/browser`) pointed at your deployment URL.
3. Wrap the client with `createConvexMemoriesPersistence(client)` and pass the result as `persistence` into `mergeMemory` / `search` / `MemoriesClient` from **this package** (they are aliases of the async core APIs).

```ts
import { ConvexHttpClient } from "convex/browser";
import {
  createConvexMemoriesPersistence,
  mergeMemory,
  type MemoriesClient,
} from "@khoralabs/memories-convex";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
const persistence = createConvexMemoriesPersistence({
  query: (ref, args) => convex.query(ref, args),
  mutation: (ref, args) => convex.mutation(ref, args),
  action: (ref, args) => convex.action(ref, args),
});

await mergeMemory({ persistence }, { /* MergeMemoryParams */ });
```

`createConvexMemoriesPersistence` uses **`api`** from `src/component/_generated/api` (`api.mutations.*`, `api.queries.*`, `api.actions.*`). Re-exported as `export { api } from "@khoralabs/memories-convex"` for in-process typing; host apps use `components.<name>` from their own `_generated/api`.

**Host Convex functions:** import **`createMemoriesPersistence`** from `@khoralabs/memories-convex` and call it with `(ctx, components.<name>)`. It adapts `ctx` for query vs mutation vs action and returns `{ persistence, bridge }` (reuse `bridge` for `createConvexLexicalTextStore`, etc.). For custom bridges, use `createConvexMemoriesPersistenceFromHostBridge` or the **`hostComponentBridgeFrom*Ctx`** helpers directly.

**React:** import `MemoriesPersistenceProvider`, `useMemoriesPersistence`, and `memoriesConvexHostRefsFromApi` from `@khoralabs/memories-convex/react`. Create one `ConvexReactClient`, pass it to **both** `ConvexProvider` and `MemoriesPersistenceProvider` with `componentApi={memoriesConvexHostRefsFromApi(api)}` (host `api.memoriesHost*` forwards — raw `components.memories` refs fail `ConvexReactClient` query/mutation/action validation in the browser). The provider does not use `useConvex()` so bundlers (including Bun’s HTML dev server) do not pull a second `react` copy through `convex/react` and break hooks.

**Bun example app** (`bun run dev:example` from this package): [`example/src/App.tsx`](example/src/App.tsx) drives **merge** (`mergeMemory` overload A + optional atomic B), **search** (lexical, hybrid with a deterministic 768-dim fake embedding, neighbors, extra namespace, unscoped DB toggle), **graph reads**, and **capability / indexed-dimension** readouts. `convex/memories.ts` only re-exports host bridge helpers; the UI calls component queries and client APIs directly. **Unscoped search** in the demo is opt-in and intended for small toy deployments only.

## Transactions

`withTransaction` in the adapter **only** runs `await fn()` (no distributed transaction across mutations).

**`mergeMemory` (package export)** has two overloads:

1. **Overload A — `MutationCtxAsync` (`{ persistence }`)** — Calls core `mergeMemoryAsync`, which issues **many** Convex mutations/queries in sequence. Each RPC is atomic on the server; the **full merge is not** one transaction.

2. **Overload B — `MergeMemoryConvexAtomicCtx` (`{ client, refs }`)** — Runs a **single** component mutation `mergeMemoryAtomic` (same merge **order** as `mergeMemoryAsync`: neighbors → clear subtree → upsert → content → labels → edges → search meta + label-props for synced keys). Use this from another Convex mutation/action when you need **one transactional merge**. `ontology` on `MergeMemoryParams` is **not supported** on this path (throw if set); use overload A or omit ontology.

For deletes and other flows that still use `createConvexMemoriesPersistence`, behavior is unchanged: sequential RPCs unless you add dedicated batched mutations.

## Contract

See [`../IMPLEMENTORS.md`](../IMPLEMENTORS.md) for cross-backend persistence notes and [`../sqlite/IMPLEMENTORS.md`](../sqlite/IMPLEMENTORS.md) for the reference SQLite behavior this implementation aims to match for the supported subset.
