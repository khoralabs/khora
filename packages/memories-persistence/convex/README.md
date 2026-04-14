# @cfd/memories-convex

Convex **component** and TypeScript client for the Smithy-aligned memories persistence surface (**lexical search first**). It implements `MemoriesPersistenceAsync` via Convex queries/mutations under `convex/`, and re-exports the async-first **memories client API** from `@cfd/memories-core` under primary names (`MemoriesClient`, `mergeMemory`, `search`, `deleteMemory`) so call sites stay readable without an `Async` suffix. **Sync** `MemoriesClient` / `mergeMemory` / `search` from core are not re-exported.

## Capabilities

| Feature | Supported |
|--------|-----------|
| Lexical search | Yes (Convex search indexes on `text_features.text`) |
| Vector search | No (`vectorSearch: false`; merge rejects vector content when configured accordingly) |
| Neighbor index | No (`neighborIndex: false`; `listNeighborsForMemory` returns `[]`) |
| Multi-namespace search | Yes (`multiNamespaceSearch: true`; per-namespace arms merged round-robin) |
| Unscoped search | No (`unscopedSearch: false`) |
| `syncLabelPropsSearchFeatures` | Not exposed (optional in core; omitted here) |

`MemoriesPersistenceAsync` is still exported under its **real** name. Do not confuse it with sync `MemoriesPersistence` from core.

## Install

In a monorepo workspace:

```bash
bun add @cfd/memories-convex
```

Add this folder as a Convex component per [Convex Components](https://docs.convex.dev/components) (see `convex.config.ts` and schema under `src/`). Run `bunx convex codegen` / `bunx convex dev` when functions change so `src/_generated/api` stays aligned; `src/_generated/server` may be hand-maintained for local `tsc`.

## Usage

1. Deploy or run Convex with this package’s `convex/` directory available to the backend (component or copied module path as your setup requires).
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
const persistence = createConvexMemoriesPersistence(convex);

await mergeMemory({ persistence }, { /* MergeMemoryParams */ });
```

`createConvexMemoriesPersistence` uses **`api`** from `./_generated/api` (`api.mutations.*`, `api.queries.*`). Re-exported as `export { api } from "@cfd/memories-convex"` for host apps that call Convex directly.

## Transactions

`withTransaction` in the adapter **only** runs `await fn()` (no distributed transaction). Merge/delete in core issue many persistence calls; each Convex mutation is its own atomic transaction. This is weaker than SQLite’s single-process transaction until you add a batched or single-mutation merge path.

## Contract

See [`../IMPLEMENTORS.md`](../IMPLEMENTORS.md) for cross-backend persistence notes and [`../sqlite/IMPLEMENTORS.md`](../sqlite/IMPLEMENTORS.md) for the reference SQLite behavior this implementation aims to match for the supported subset.
