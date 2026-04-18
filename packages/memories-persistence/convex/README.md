# @cfd/memories-convex

Convex **component** and TypeScript client for the Smithy-aligned memories persistence surface (**lexical search first**). It implements `MemoriesPersistenceAsync` via Convex queries/mutations under `src/component/`, and re-exports the async-first **memories client API** from `@cfd/memories-core` under primary names (`MemoriesClient`, `mergeMemory`, `search`, `deleteMemory`) so call sites stay readable without an `Async` suffix. **Sync** `MemoriesClient` / `mergeMemory` / `search` from core are not re-exported.

## Capabilities

| Feature | Supported |
|--------|-----------|
| Lexical search | Yes (Convex search index on `text_features.text`; subtree filters use `ns_prefix_1`…`ns_prefix_6`) |
| Vector search | Yes (`vectorSearch: true`; KNN via `ctx.vectorSearch` in component **action** `searchVectorSourceMapIds`; embeddings stored per dimension in `vector_features_768` / `_1024` / `_1536` / `_3072`) |
| Neighbor index | No (`neighborIndex: false`; `listNeighborsForMemory` returns `[]`) |
| Multi-namespace search | Yes (`multiNamespaceSearch: true`; per-namespace arms merged round-robin) |
| Unscoped search | No (`unscopedSearch: false`) |
| `syncLabelPropsSearchFeatures` | Not exposed (optional in core; omitted here) |

Hierarchical namespaces use **cumulative prefix** columns (`ns_prefix_k` = first *k* segments joined with `/`) on `text_features` and `vector_features_*` so a subtree query is a single `eq` per root (Convex vector filters allow only `eq` + `or`, not chained `and` across fields). See `src/vectorConfig.ts` for supported embedding widths.

**Hybrid / vector retrieval:** Callers must supply a Convex client that implements **`action`** (e.g. `ctx.runAction` from an action, or the client’s action runner). Lexical-only `search()` can use query + mutation only; vector arms use the component action.

`MemoriesPersistenceAsync` is still exported under its **real** name. Do not confuse it with sync `MemoriesPersistence` from core.

## Install

In a monorepo workspace:

```bash
bun add @cfd/memories-convex
```

Add this package as a Convex component per [Convex Components](https://docs.convex.dev/components). The component root is `src/component/` (`convex.config.ts`, `schema.ts`, queries/mutations, and `src/component/_generated/`).

**Packaged components** do not get regenerated from a host app’s `convex dev` alone. After changing component functions or schema, run codegen from **this package** (same pattern as [@very-coffee/convex-facts](https://github.com/coffee-fueled-dev/agent/tree/main/packages/convex-facts)):

```bash
bun run codegen
```

This runs `convex codegen --component-dir ./src/component`. It needs a Convex deployment context (e.g. `CONVEX_DEPLOYMENT` or a local `convex dev` / backend as required by your Convex CLI version). Commit updated files under `src/component/_generated/`.

Hosts import the component config as:

```ts
import memories from "@cfd/memories-convex/convex.config.js";
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
} from "@cfd/memories-convex";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
const persistence = createConvexMemoriesPersistence({
  query: (ref, args) => convex.query(ref, args),
  mutation: (ref, args) => convex.mutation(ref, args),
  action: (ref, args) => convex.action(ref, args),
});

await mergeMemory({ persistence }, { /* MergeMemoryParams */ });
```

`createConvexMemoriesPersistence` uses **`api`** from `src/component/_generated/api` (`api.mutations.*`, `api.queries.*`, `api.actions.*`). Re-exported as `export { api } from "@cfd/memories-convex"` for in-process typing; host apps use `components.<name>` from their own `_generated/api`.

**Host Convex functions:** import **`createMemoriesPersistence`** from `@cfd/memories-convex` and call it with `(ctx, components.<name>)`. It adapts `ctx` for query vs mutation vs action and returns `{ persistence, bridge }` (reuse `bridge` for `createConvexLexicalTextStore`, etc.). For custom bridges, use `createConvexMemoriesPersistenceFromHostBridge` or the **`hostComponentBridgeFrom*Ctx`** helpers directly.

**React:** import `MemoriesPersistenceProvider` and `useMemoriesPersistence` from `@cfd/memories-convex/react`. Wrap `ConvexProvider` first, then `MemoriesPersistenceProvider` with `componentApi={components.memories}`.

## Transactions

`withTransaction` in the adapter **only** runs `await fn()` (no distributed transaction). Merge/delete in core issue many persistence calls; each Convex mutation is its own atomic transaction. This is weaker than SQLite’s single-process transaction until you add a batched or single-mutation merge path.

## Contract

See [`../IMPLEMENTORS.md`](../IMPLEMENTORS.md) for cross-backend persistence notes and [`../sqlite/IMPLEMENTORS.md`](../sqlite/IMPLEMENTORS.md) for the reference SQLite behavior this implementation aims to match for the supported subset.
