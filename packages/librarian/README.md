# @cfd/librarian

Memory **librarian** agent: composable tools (`memory_search`), static identity, and session runtime wired the same way as [`@cfd/agent-identity`](../agent-identity/README.md)’s declarative model.

## Public API

The package root exports a **minimal** surface:

- **`Librarian`** — construct with a **`MemoriesClient`** (or async variant) from [`@cfd/memories`](../memories), an [AI SDK embedding model](https://ai-sdk.dev/docs/ai-sdk-core/embeddings#embedding-providers--models) from your app (e.g. `createGoogleGenerativeAI({ apiKey }).embedding("gemini-embedding-2-preview")`), an **`EmbeddingResolutionPreset`** (`L` | `M` | `H` for Google output dimensionality), and **`multimodal`**. Use **`processLogicalMemory(...)`** for the full remember pipeline and **`embedTextChunks(...)`** for query vectors.
- **`multimodal: true`** requires the embedding model **`gemini-embedding-2-preview`** and enables non–text-like file blobs (multimodal embed path). With **`multimodal: false`**, only text and text-like files are embedded; other binaries throw.
- **`listSourceMapsForMemory`** — SQLite helper for source-map listing.
- **Types** — `LibrarianOptions`, `LibrarianEmbeddingConfig`, `LibrarianProcessLogicalMemoryParams`, `EmbeddingResolutionPreset`, `ProcessLogicalMemoryResult`, `LibrarianPipelineGeneration`.

Provider packages (e.g. `@ai-sdk/google`) are **not** dependencies of `@cfd/librarian`; the application supplies the embedding `model`.

Internals (agent, workflow helpers, adapters, telemetry) live under `src/` and are not re-exported from the package root.

## Logging & telemetry

Structured logs use **pino** inside the package (`src/telemetry/logger.ts`). Set **`LOG_LEVEL`** (`trace`…`fatal`, default `info`). **`debug`** includes `librarian.embed.*` timings.

**`LOG_DESTINATION`:** optional file path. When set, the logger **multistreams** to **stdout** and append-only **NDJSON** on disk.

**Phases (prefix `librarian.`):** `remember.*`, `runner.*`, `toolLoop.*`, `toolkit.*`, `embed.*`, `agentSession.*`. See [`src/telemetry/payloads.ts`](src/telemetry/payloads.ts).

## Develop

```bash
bun test
bunx tsc --noEmit
```
