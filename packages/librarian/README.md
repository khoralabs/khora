# @cfd/librarian

Memory **librarian** agent: composable tools (`memory_search`), static identity, and session runtime wired the same way as [`@cfd/agent-identity`](../agent-identity/README.md)’s declarative model.

## Declarative shape

1. **Composition** — `memoryLibrarianToolkit` in [`src/agent/toolkit.ts`](src/agent/toolkit.ts): `tool` + `toolkit` from agent-identity (handlers + optional toolkit/tool **pipeline hooks** later).
2. **Identity + registration** — [`declareMemoryLibrarianAgent` / `MemoryLibrarianAgentDeclaration`](src/agent/declaration.ts): `RegisteredAgentIdentity` + `RegisterAgentOptions` (`run` + session `onAfterContext`).
3. **Orchestration** — [`createMemoryLibrarianSessionRunner`](src/agent/memory-librarian-session.ts): the only session-layer **runner**; evaluates affordances, runs the AI SDK tool loop, merges.
4. **Session vs toolkit hooks** — Session hooks live on registry registration (`onAfterContext` builds `ToolkitContext` / `ToolRuntimeContext`). Toolkit pipeline hooks (`onPolicyEvaluated` / `onToolExecuted`) are separate and attach to composables or `ToolkitContext.pipelineHooks` when you add them.

End-to-end flow: [`processLogicalMemoryWithLibrarian`](src/workflow/process-logical-memory.ts) (prefetch → resolve → `declareMemoryLibrarianAgent` → `register` → `createSession` → `start`). Pass one [`EmbeddingModel`](src/adapters/embedding-model.ts) with `embedConfig` (e.g. `embedConfigForResolutionPreset("L" | "M" | "H")` for `outputDimensionality`) so decomposition, prefetch, `memory_search`, and merge use the same vector size.

## Logging & telemetry

Structured logs use **pino** (`import { logger, librarianLog } from "@cfd/librarian"`). Set **`LOG_LEVEL`** (`trace`…`fatal`, default `info`). **`debug`** includes `librarian.embed.*` timings.

**Shape:** every line is built with **`librarianLog(phase, payload)`** from [`src/logs/payloads.ts`](src/logs/payloads.ts). Payloads extend the contract in [`src/logs/logger.ts`](src/logs/logger.ts) (`phase`, **`processTimeMs`**, plus phase-specific fields).

**`LOG_DESTINATION`:** optional file path. When set, the **same** logger **multistreams** to **stdout** and append-only **NDJSON** on disk (`sync: true` on the file). Session lifecycle, pipeline, toolkit, runner, and embed logs all share this behavior.

**Phases (prefix `librarian.`):**

- **remember.** `decompose`, `prefetchSearch`, `resolveSources`, `registerAgent`, `sessionStart`, `pipeline`
- **runner.** `evaluateAffordances`, `toolLoopGenerate`, `mergeMemory`
- **toolLoop.** `step`, `finish`
- **toolkit.** `toolCall`, `memory_search`
- **embed.** `textChunks`, `binaryBlob` (debug)
- **agentSession.** `onStart`, `onAfterIdentity`, `onAfterContext`, `onBeforeRun`, `onAfterRun`, `onError` (identity + safe summaries; no full plaintext/blobs)

**Tool I/O:** **`librarian.toolkit.toolCall`** — each `memory_search` tool execution: `input` (query text truncated to 200 chars unless **`LIBRARIAN_LOG_TOOL_BODIES`** is `1`/`true`/`yes`), `outputSummary`, **`processTimeMs`** (tool span), `ok`. **`librarian.toolkit.memory_search`** — `embedMs`, `searchMs`, `embedCacheHit`, `hitCount`, **`processTimeMs`** (full handler).

**`agentSession.runner`** is still logged from `@cfd/agent-identity` for the registry runner (`durationMs`, `agentId`, `name`, `staticHash`) — separate from `@cfd/librarian` phases.

## Develop

```bash
bun test
bunx tsc --noEmit
```
