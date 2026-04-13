# @cfd/memories-adapter

The **Memory Adapter** agent turns **app-defined domain objects** into expanded plaintext (and optional key hints) scoped to whatever **memory namespace** you pass in—namespace is arbitrary per call; the adapter does not bake in product-specific context beyond what you supply. After an `AgentRegistry` session run, output maps to `LogicalMemoryInput` for downstream merge. Hybrid `memory_search` comes from **`@cfd/memories-tools`**.

**Dependencies:** `@cfd/agent-identity`, `@cfd/agent-identity-adapters` (AI SDK tool bridge), `@cfd/memories-core`, `@cfd/memories-tools`, `ai`, `zod`.

- **Identity**: `defineMemoryAdapterIdentity` / `registerMemoryAdapterAgent` — optional `identityContext` merges into `createRegisteredAgentIdentity` context.
- **Client**: `MemoryAdapterClient` — `expand()` runs the adapter session for your namespace and returns `{ draft, generation }`; map with `expandedDraftToLogicalMemoryInput` for the next merge step.
- **Structured output**: `plaintext`, optional `memoryKeySuggestion`, and optional ontology-aware **`nodeLabelHints`** / **`edgeLabelHints`** (built from `MemoriesClient.ontology` via `zExpandedMemoryWireFromOntology`). Edge hint rows allow at most one edge-kind payload per row.
- **Domain payload**: app-defined (e.g. validate with Zod at the host); `MemoryAdapterClient.expand` is generic over `domainPayload`. The CLI todo command uses its own schema in `apps/cli/src/todo-domain-payload.ts`.
- **CLI example**: `bun run src/index.ts todo add --title "..."` in `@cfd/cli` uses the adapter with a sample payload (memory namespace `cli/todo`).
