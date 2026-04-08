# @very-coffee/agent-identity

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
} from "@very-coffee/agent-identity";

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

- `defineAgentIdentity` / `createIdentityLink`

### Dashboard-style helpers

- `formatHashShort` / `diffToolRefs` / `diffIdentityLinks` / `explainIdentityLinkRelationship`

### Registries (in-memory; tests / examples)

- `createToolRegistry` / `createAgentRegistry` / `hashToolComposableStatic`

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
