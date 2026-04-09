# @cfd/librarian

Memory **librarian** agent: composable tools (`memory_search`), static identity, and session runtime wired the same way as [`@cfd/agent-identity`](../agent-identity/README.md)’s declarative model.

## Declarative shape

1. **Composition** — `memoryLibrarianToolkit` in [`src/agent/toolkit.ts`](src/agent/toolkit.ts): `tool` + `toolkit` from agent-identity (handlers + optional toolkit/tool **pipeline hooks** later).
2. **Identity + registration** — [`declareMemoryLibrarianAgent` / `MemoryLibrarianAgentDeclaration`](src/agent/declaration.ts): `RegisteredAgentIdentity` + `RegisterAgentOptions` (`run` + session `onAfterContext`).
3. **Orchestration** — [`createMemoryLibrarianSessionRunner`](src/agent/memory-librarian-session.ts): the only session-layer **runner**; evaluates affordances, runs the AI SDK tool loop, merges.
4. **Session vs toolkit hooks** — Session hooks live on registry registration (`onAfterContext` builds `ToolkitContext` / `ToolRuntimeContext`). Toolkit pipeline hooks (`onPolicyEvaluated` / `onToolExecuted`) are separate and attach to composables or `ToolkitContext.pipelineHooks` when you add them.

End-to-end flow: [`processLogicalMemoryWithLibrarian`](src/workflow/process-logical-memory.ts) (prefetch → resolve → `declareMemoryLibrarianAgent` → `register` → `createSession` → `start`).

## Develop

```bash
bun test
bunx tsc --noEmit
```
