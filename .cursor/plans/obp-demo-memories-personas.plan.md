# OBP matchmaking + memories personas (revised)

## Goals

- Give each matchmaking agent a **persona in the KG** by seeding an **ordered list of adapter payloads** (see below): past connection attempts as **`meeting_intent`**, outcomes/reflections as **`meeting_reflection`** (each still natural-language text inside the payload).
- Seed each payload **in order** using the **same adapter → integrator pipeline as CLI todo-add**, then run the meeting-request negotiator against that KG.
- Keep **negotiation-specific toolkit copy** in the demo (composed root composable instructions), not in `@cfd/memories-tools`.

## Reference pipeline (must match CLI)

[`apps/cli/src/commands/todo-add.ts`](apps/cli/src/commands/todo-add.ts):

1. `MemoryAdapterClient.expand({ registry, namespace, model, client, embeddingModel, ingest, domainPayload, maxSteps })` → `draft`
2. `expandedDraftToLogicalMemoryInput(draft, ns, key)` → `LogicalMemoryInput`
3. `processLogicalMemoryWithIntegrator` from [`apps/cli/src/integrate-memory.ts`](apps/cli/src/integrate-memory.ts) (decompose → `MemoryIntegratorClient.integrate` → `integratorWireToMergeSlice` → `mergeLogicalMemoryWithMergeSlice`)

[`apps/cli/src/commands/remember.ts`](apps/cli/src/commands/remember.ts) skips the adapter; **seeding must use the todo-add path**, not remember-only.

## Refactor: shared integrator merge pipeline

`processLogicalMemoryWithIntegrator` today depends on CLI-only `getCliChatModel` / `getCliEmbeddingModel` / `dbPath` / `resolution`.

- **Extract** a parameterized function, e.g. `processLogicalMemoryWithIntegrator`, into **`@cfd/memories-integrator`** (new module, e.g. `logical-memory-pipeline.ts`), taking:
  - `bundle`: same shape as [`MemoriesCliBundle`](apps/cli/src/shared.ts) (`db`, `persistence`, `client`) or a minimal `{ client }` if persistence is only needed for CLI store sync
  - `logicalMemory: LogicalMemoryInput`
  - `chatModel: LanguageModel`
  - `embeddingModel: EmbeddingModel` (and whatever `decomposeLogicalMemoryToContent` needs)
  - `maxSteps?`
- **Update** CLI `integrate-memory.ts`, `todo-add.ts`, and `remember.ts` to call the package export and pass `getCliChatModel()` / `getCliEmbeddingModel(dbPath, resolution)` so behavior stays identical.

This avoids duplicating the merge/decompose steps in `obp-demo` and keeps “same pipeline” literal.

## Adapter domain payloads (demo-only)

Define two **discriminated** JSON shapes passed to `MemoryAdapterClient.expand` as `domainPayload` (validated in the demo with Zod). The adapter’s user message is always JSON ([`buildMemoryAdapterUserMessage`](packages/memories/agents/adapter/src/messages.ts)); these kinds give the model a clear semantic split without changing `@cfd/memories-adapter`.

| Kind | Role |
|------|------|
| **`meeting_intent`** | A past attempt to connect via the meeting-request platform (who/when/ask, what you wanted from the intro). |
| **`meeting_reflection`** | How a requested meeting actually went, or your takeaway afterward (outcome, tone, whether it was worth it). |

**Suggested wire shape** (exact field names can be minimal—implementation choice):

```ts
// Discriminated union
| { kind: "meeting_intent"; text: string }
| { kind: "meeting_reflection"; text: string };
```

Optional extra fields later (e.g. `counterparty_hint`, `rough_when`)—not required for v1.

**Seed data per agent**: an **ordered array** of these objects (not a single flat `string[]`). Processing order is still index order: `0`, then `1`, … Each item maps to one adapter → integrator pass with that item as `domainPayload`.

## Memories store setup (demo)

- Mirror CLI: [`openMemoriesDatabase`](packages/memories/persistence/sqlite/src/connection.ts), [`createMemoriesPersistence`](packages/memories/persistence/sqlite/src/persistence.ts) with [`canonicalLabelPropsSearchFormatter`](packages/memories/memories-ontologies/src/label-props-canonical-format.ts), [`MemoriesClient`](packages/memories/core/src/api/client.ts) + [`canonicalOntology`](packages/memories/memories-ontologies/src/cannonical.ts).
- **One DB** for the demo run (`:memory:` or file); **two namespaces** (e.g. `obp_demo/matchmaking/requester` and `obp_demo/matchmaking/requestee`) so each agent’s `memory_search` stays isolated.

## Seeding loop (per agent, in order)

For each namespace:

- For each **`MeetingSeedPayload`** item in that agent’s ordered array (serial `await`):

  1. `createAgentRegistry()` (same as todo-add: fresh registry per adapter call, or follow CLI exactly).
  2. `new MemoryAdapterClient({ identityContext: { app: "obp-demo", product: "matchmaking-seed" } })` (parallel to CLI todo identity).
  3. `expand` with:
     - `ingest`: e.g. `{ sourceApp: "obp-demo-matchmaking", correlationId: \`seed-${namespace}-${index}\` }`
     - **`domainPayload`**: the discriminated object (`meeting_intent` or `meeting_reflection` + `text`), serialized as in [`buildMemoryAdapterUserMessage`](packages/memories/agents/adapter/src/messages.ts).
  4. `key`: stable unique per item, e.g. `seed-${index}` or include timestamp once per run.
  5. `processLogicalMemoryWithIntegrator` (from package after refactor) with the same `client` / embedding / chat models as the rest of the demo.

- Order matters: process `i` before `i+1` so later integrator runs can `memory_search` prior graph context if the model chooses to.

## Matchmaking negotiator (after seed)

- Composed root composable: `toolkit([obpToolkit, memorySearchToolkit], { name: "...", instructions: [...] })` with **demo-only** negotiation + memory guidance.
- `createObpNegotiatorAgent` / `buildObpToolkitContext` widened to `Env extends ObpToolkitEnv` intersected with `MemorySearchEnv` (`toMemorySearchEnv`).
- **Same** `MemoriesClient` and namespaces as seeding; turn runner sets `namespace` + `embeddingModel` per agent.
- Static instructions: existing intro-request copy + **starting negotiation goal** per role.

## Dependencies

- `obp-demo`: add `@cfd/memories-adapter`, `@cfd/memories-integrator`, `@cfd/memories-core`, `@cfd/memories-sqlite`, `@cfd/memories-tools`, `@cfd/memories-core-ontologies` (workspace).
- Integrator package: add dependency on `memories-core/helpers` if not already present for `decomposeLogicalMemoryToContent` / `mergeLogicalMemoryWithMergeSlice` (verify imports in extracted pipeline).

## Testing

- CLI: smoke `todo add` / `remember` after refactor.
- `obp-demo`: `bun run typecheck`; optional test that seeding runs without throw (mock or skipped LLM if too heavy).

## Out of scope unless requested

- P2P negotiation CLI (`p2pSession.ts`) — same pattern can be applied later.
