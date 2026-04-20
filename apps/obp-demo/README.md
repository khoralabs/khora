# `@cfd/obp-demo`

CLI demonstration of two **scripted** agents using [`@cfd/agent-identity`](../../packages/agent/identity) (registered toolkits + static/runtime hashes) and [`@cfd/obp-core`](../../packages/obp/core) [`ObpClient`](../../packages/obp/core/src/client.ts) backed by in-memory [`@cfd/obp-sqlite`](../../packages/obp/persistence/sqlite).

Identity hashes are **attribution** for the transcript (which capability snapshot each side represents). OBP enforces **exposure** (no bind to unexposed ports), **capacity** (`max_bindings`), and **deduplication** of binds.

## Run

```bash
# from repo root (after bun install)
cd apps/obp-negotiation-demo
bun run demo:collab
bun run demo:adversarial
```

Or: `bun run demo collaborative` / `bun run demo adversarial` / `bun run demo llm`.

## LLM negotiation (`demo:llm`)

Requires a Google Gemini API key (same names as [`apps/cli`](../../cli/src/shared.ts)): `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`.

Optional: `OBP_NEGOTIATION_MODEL` (default `gemini-2.0-flash-lite`).

Two LLM agents (buyer / seller) take turns. **Communication is OBP-native**: each side only sees **persisted** rows in the snapshot (`extendOffer`, `exposePort`, `bindPort`). Negotiation text and numeric proposals are encoded in [`Offer.type`](../../packages/obp/core/src/model/types.ts) / [`Port.type`](../../packages/obp/core/src/model/types.ts) via [`src/llm/encoding.ts`](src/llm/encoding.ts) (`demo.negotiation.v1`, `demo.deal.v1`). Peer **private goals** (buyer max / seller min price) appear only in **that** agent’s system prompt—never in the other’s.

The seller eventually exposes a **`terminal: true`** deal port; the buyer **`bindPort`** only to that terminal port on the **seller’s offer**, with price validated against the mutual band.

The **human observer** sees full system/user prompts, structured model output, and apply results printed to stdout.

## Scenarios

| Script | What it shows |
|--------|----------------|
| **collaborative** | Both parties register; seller **extends** an offer and **exposes** a port; buyer **binds**. Includes `createIdentityLink` lines for static vs runtime hash. |
| **adversarial** | Three isolated beats on fresh `:memory:` DBs: bind to an **orphan** port (not exposed) → `NOT_EXPOSED`; exposed port with **`max_bindings: 0`** → `MAX_BINDINGS`; successful bind then **duplicate** bind → `VALIDATION`. |
| **llm** | Gemini `generateText` with `Output.object` (structured turn); graph snapshot prompts; terminal port + bind to close. |

File-backed SQLite is optional: use [`openObpDatabase`](../../packages/obp/persistence/sqlite/src/connection.ts) from `@cfd/obp-sqlite` if you want persistence across runs.

## Verification

```bash
bun test
bunx tsc -p apps/obp-negotiation-demo --noEmit
bunx biome check apps/obp-negotiation-demo
```

When layering higher-level agents, prefer **`ObpClient`** so validation stays aligned with the OBP Smithy shapes; this demo calls `ObpClient` directly.
