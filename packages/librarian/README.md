# @cfd/librarian

Memory **librarian** agent: composable tools (`memory_search`), static identity, and session runtime wired the same way as [`@cfd/agent-identity`](../agent-identity/README.md)’s declarative model.

## Declarative shape

1. **Composition** — `memoryLibrarianToolkit` in [`src/agent/toolkit.ts`](src/agent/toolkit.ts): `tool` + `toolkit` from agent-identity (handlers + optional toolkit/tool **pipeline hooks** later).
2. **Identity + registration** — [`declareMemoryLibrarianAgent` / `MemoryLibrarianAgentDeclaration`](src/agent/declaration.ts): `RegisteredAgentIdentity` + `RegisterAgentOptions` (`run` + session `onAfterContext`).
3. **Orchestration** — [`createMemoryLibrarianSessionRunner`](src/agent/memory-librarian-session.ts): the only session-layer **runner**; evaluates affordances, runs the AI SDK tool loop, merges.
4. **Session vs toolkit hooks** — Session hooks live on registry registration (`onAfterContext` builds `ToolkitContext` / `ToolRuntimeContext`). Toolkit pipeline hooks (`onPolicyEvaluated` / `onToolExecuted`) are separate and attach to composables or `ToolkitContext.pipelineHooks` when you add them.

End-to-end flow: [`processLogicalMemoryWithLibrarian`](src/workflow/process-logical-memory.ts) (prefetch → resolve → `declareMemoryLibrarianAgent` → `register` → `createSession` → `start`). Pass one [`EmbeddingModel`](src/adapters/embedding-model.ts) with `embedConfig` (e.g. `embedConfigForResolutionPreset("L" | "M" | "H")` for `outputDimensionality`) so decomposition, prefetch, `memory_search`, and merge use the same vector size.

## Logging & telemetry

Structured logs use **pino** (`import { logger } from "@cfd/librarian"`). Set **`LOG_LEVEL`** (`trace`…`fatal`, default `info`). **`debug`** includes `embedTextChunks` / `embedBinaryBlob` timings.

**Tool I/O (memory librarian):**

- **`librarian.toolCall`** — each `memory_search` completion: `input` (query text truncated to 200 chars unless **`LIBRARIAN_LOG_TOOL_BODIES`** is `1`/`true`/`yes`), `outputSummary` (`hitCount`, `memoryKeys`), `durationMs`, `ok`.
- **`librarian.memory_search`** — handler spans: `embedMs`, `searchMs`, `embedCacheHit`, `hitCount`.

Remember pipeline log phases (when using `processLogicalMemoryWithLibrarian`): `remember.decompose`, `remember.prefetchSearch`, `remember.resolveSources`, `remember.registerAgent`, `remember.sessionStart` (includes agent runner), `remember.pipeline`. Session runner: `librarian.evaluateAffordances`, per-step `librarian.toolLoop.step` and `librarian.toolLoop.finish`, `librarian.toolLoopGenerate`, `librarian.mergeMemory`. **`agentSession.runner`** is logged from `@cfd/agent-identity` for the registry `SessionRunner` duration.

## Develop

```bash
bun test
bunx tsc --noEmit
```
