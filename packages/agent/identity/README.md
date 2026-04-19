# @cfd/agent-identity

**Composable toolkits + policies → deterministic SHA-256 fingerprints** for static tool definitions and for the effective tool set at evaluation time—so you can correlate behavior with a **versioned capability snapshot** (logs, evals, storage).

## What it does

- **Composable graph**: `tool`, `toolkit`, `dynamicToolkit`; evaluate with `ToolkitContext` (`env`, optional `namespace` / `agentId` / `agentName`, optional `pipelineHooks` / `inheritedPipelineHooks`).
- **Pipeline hooks** (not part of static hashes): `onPolicyEvaluated` / `onToolExecuted` via `mergeToolPipelineHooks`. Three levels — `hooks` on `toolkit` / `tool`, plus `ToolkitContext.pipelineHooks` (runtime). Typical merge order: ancestor toolkit → tool → runtime. Member tool policies are usually evaluated once at the parent toolkit (deduped); leaf `tool` hooks for policy run when that tool evaluates a policy not already in the shared `PolicyResultMap`.
- **Policies**: async gates that prune tools at runtime; policies dedupe by object identity.
- **Static hash**: bottom-up hash of “what this toolkit can be” (per-tool semantics + structure).
- **Runtime hash**: hash of enabled tools only, after policies (sorted by tool name).
- **Zero runtime dependencies** (`dependencies` is empty). **[Standard Schema](https://standardschema.dev)** `inputSchema`; hashed canonically (e.g. `toJSONSchema()` when present).

This is **not** end-user authentication. `agentId` / `name` on `RegisteredAgentIdentity` are **your** labels for telemetry or storage.

## When to use it

- Tool lists change by **environment**, **feature flags**, or **deploys** — you need to know **which snapshot** ran (e.g. assistant gets different tools in staging vs prod).
- **Policies** gate tools — you need **runtime** identity, not only static.
- You want **stable ids** for dashboards, evals, or logs without ad hoc versioning.
- **Before/after** changing a tool’s schema or instructions — static hashes shift; use `diffToolRefs` / canonical payloads to compare.

**When not to:** you only need a single fixed tool list forever and never compare runs—skip this and use your framework’s tools directly.

**Out of scope:** persistence, threads, transports. You supply correlation ids (message id, job id, etc.). Optional: store hashes in **Convex** or any DB per message/job; this package does not require Convex.

## Quick example

Full pipeline (matches how many apps record one evaluation):

```ts
import {
  computeRuntimeIdentityFromEvaluation,
  toolkit,
  tool,
} from "@cfd/agent-identity";

const search = tool({
  name: "search",
  inputSchema: yourStandardSchema,
  instructions: "…",
  handler: async () => {},
});

const root = toolkit([search], { name: "my-agent-tools" });

const { runtimeHash, toolRefs, evaluatedTools } =
  await computeRuntimeIdentityFromEvaluation(root, {
    env: { userTier: "pro" },
  });
```

Lower-level pieces: `collectToolStaticHashes(root)` → map of tool name → leaf hash; `evaluateComposable(root, ctx)` → tools; then `computeRuntimeHash(enabledNames, map, tools)` or `resolveRuntimeToolRefs(...)`.

More runnable scripts under `examples/` (see below). `examples/toAiSdk.ts` maps evaluated `ToolSpec` values to Vercel AI SDK `tool()`.

## Declarative agents and sessions for implementors

**Single declaration.** Treat **`RegisteredAgentIdentity`** (from `createRegisteredAgentIdentity`) plus **`register(agent, { hooks, ctx, run })`** as one declaration of (1) *who* the agent is—root composable, static instructions, static context—and (2) *how* sessions are wired: optional **hooks**, **context** layers (`ctx`), and the **`run`** function. Registration is data-shaped; you are not reimplementing evaluation or the session machine.

**One orchestration implementation.** For a product, the only required **orchestration** at the session layer is a **`SessionRunner`**: implement **`run`** as `({ agent, input, context }) => output`. Everything else there is optional: **hooks** for cross-cutting behavior and **`ctx`** for merged static context and async resolvers. Session hooks wrap **one** invocation of `run`; they do not replace it.

**Two hook layers** — bind functions to the right layer so “hooks” does not mean “rewrite the tool loop”:

1. **Toolkit pipeline hooks** — `onPolicyEvaluated` / `onToolExecuted`, merged via `mergeToolPipelineHooks`, on **`toolkit` / `tool`** definitions and optionally **`ToolkitContext.pipelineHooks`**. These run **inside** composable evaluation while policies and tools execute. Use for telemetry or side effects around policy/tool execution, not for substituting your own evaluation loop.

2. **Session hooks** — `onStart`, `onAfterIdentity`, `onAfterContext`, `onBeforeRun`, `onAfterRun`, `onError` on **`register`** / **`createSession`**, or chained on the returned **`AgentSession`**. These run **around** building `SessionContext` and calling **`run`**. Use for session lifecycle, logging, or injecting fields before your runner evaluates affordances (e.g. building a `ToolkitContext` inside `run` or `onBeforeRun`).

**Session API.** Call **`createSession(agentId)`** with the same string **`agentId`** you used at register time, then **`start(input)`**. Optional per-session overrides use the same `{ hooks, ctx, run }` shape.

**Optional “one declarative blob” later.** A small factory or type that bundles **`RegisteredAgentIdentity`** with default **`RegisterAgentOptions`** is only sugar on top of **`register`**; it does not change semantics.

## API overview

Grouped by role; full exports (including types like `ToolSpec`, `Composable`, `IdentityLink`) are in [`src/index.ts`](src/index.ts).

### Composables and evaluation

- `tool` / `toolkit` / `dynamicToolkit`
- `evaluateComposable(composable, ctx)`
- `policy(id, evaluate)`
- `mergeToolPipelineHooks` / `evaluatePolicyWithHooks` — optional telemetry; hooks are **not** hashed

### Hashing and runtime snapshot

- `collectToolStaticHashes` / `computeRuntimeHash` / `resolveRuntimeToolRefs`
- `computeRuntimeIdentityFromEvaluation` — one-shot evaluate + static map + runtime hash + `toolRefs` + `evaluatedTools`
- `hashToolSpecIdentity` — dynamic-only / fallback tool identity
- `hashPlainObject` / `schemaToHashInput`

### Canonical payloads (debug / UI)

- `runtimeIdentityCanonicalPayload` / `toolSpecCanonicalPayload`

### Agent label + link

- `createRegisteredAgentIdentity` / `createIdentityLink`

### Dashboard-style helpers

- `formatHashShort` / `diffToolRefs` / `diffIdentityLinks` / `explainIdentityLinkRelationship`

### Registries (in-memory; tests / examples)

- `createToolRegistry` / `createAgentRegistry` / `hashToolComposableStatic`
- `createAgentRegistry().register(agent, { hooks, ctx, run })` — see [Declarative agents and sessions for implementors](#declarative-agents-and-sessions-for-implementors)
- `createAgentRegistry().createSession(agentId, { hooks, ctx, run })` — `agentId` matches `RegisteredAgentIdentity.agentId`
  - `session.onStart(...)` / `session.onAfterIdentity(...)` / `session.onAfterContext(...)` / `session.onBeforeRun(...)` / `session.onAfterRun(...)` / `session.onError(...)`
  - `session.start(input)` runs with composed hooks and merged context (`session > registry > agent static`), then **`run`**

### Output

- `withFormattedResults`

## Mapping to persistence

This package only computes hashes and payloads. A database may add its own ids (`registrationId`, `toolVersionId`, etc.). In this repo, see `packages/backend/convex/_components/identity/schema.ts`. Those ids are **not** emitted here.

## Examples

```bash
bun run example:static
bun run example:dynamic
bun run example:identity
```

`examples/toAiSdk.ts` — map `ToolSpec` → AI SDK `tool()`.

## Tests

```bash
bun test
```
