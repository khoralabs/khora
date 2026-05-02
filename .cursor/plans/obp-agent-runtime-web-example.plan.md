---
name: OBP agent-runtime web example (LLM)
overview: Bun web app under packages/obp/agent-runtime/examples — LLM-driven turns via HTTP APIs (server holds Gemini API key), client calls endpoints only; DAG snapshot + audit UI.
todos:
  - id: deps-env
    content: Add example deps (@ai-sdk/google, ai, Output + agent identity helpers); document GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY + optional OBP_NEGOTIATION_MODEL; fail closed when key missing
    status: pending
  - id: llm-turn-api
    content: "POST /api/negotiation/turn: validate API key; prepareActingTurn; Output.object({ schema }); createNegotiationAgent + generate(); parse/validate output; applyTurn; append audit"
    status: pending
  - id: state-health-apis
    content: GET /api/state (graph snapshot + audits + whose-turn hints); GET /api/health (llmReady boolean, no secrets)
    status: pending
  - id: graph-snapshot
    content: examples/graph-snapshot.ts — FakeObpPersistence + ObpClient → JSON DAG for API + optional prompt context
    status: pending
  - id: client-ui
    content: index.html + ui.ts — fetch health/state; party buttons POST turn endpoint; refresh DAG + audit log; show error when llmReady false
    status: pending
  - id: readme-script
    content: examples/README.md + package.json script (e.g. bun --hot examples/index.ts); note API key required
    status: pending
isProject: false
---

# OBP agent-runtime negotiation web example (LLM-driven)

## Goals

- **Tiny Bun web app** in [`packages/obp/agent-runtime/examples`](packages/obp/agent-runtime/examples): visualize negotiation DAG + turn audits.
- **LLM-driven turns**: each party move runs **`NegotiationRuntime.prepareActingTurn`** → **`ToolLoopAgent.generate`** with **`Output.object({ schema })`** built from the prepared Zod schema → **`NegotiationRuntime.applyTurn`** on the parsed structured output (same pipeline as production; no canned payloads).
- **API key required**: Gemini / Google AI SDK on the **server only**; reject LLM routes when unset (same env convention as [`packages/obp/examples/src/negotiation/llm/env.ts`](packages/obp/examples/src/negotiation/llm/env.ts): `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`; optional `OBP_NEGOTIATION_MODEL`, default e.g. `gemini-flash-lite-latest`).
- **HTTP API surface**: browser **never** receives the key; client code **only** calls documented REST endpoints via `fetch`.

## Security / UX

- **`GET /api/health`**: JSON like `{ "llmReady": true }` so the UI can show setup instructions when false—**no** key material in responses.
- **`POST /api/negotiation/turn`** (and any future LLM route): if key missing, respond **`503`** (or **`401`** if you prefer key-as-bearer later) with a stable `error` code string for the client.
- Optional hardening (only if needed): rate-limit or single-session lock to avoid concurrent `generate` calls—start without unless flaky.

## HTTP API (server)

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | `/api/health` | LLM configured or not (boolean only). |
| `GET` | `/api/state` | Full negotiation snapshot: DAG JSON + `audits[]` + party ids + `turnsCompleted` / `maxTurns` + suggested next `actingPartyId` if you track alternation. |
| `POST` | `/api/negotiation/turn` | Body: `{ "actingPartyId": "<uuid>" }`. Runs one LLM turn for that party (see pipeline below). Returns updated audit entry or full state. |

**Future-friendly** (not required for v1): `POST /api/negotiation/reset` to re-seed `FakeObpPersistence`.

## LLM pipeline (per `POST /api/negotiation/turn`)

1. **Assert API key** present (throw / 503 if not).
2. **`await runtime.prepareActingTurn(actingPartyId)`** → `schema`, `headOfferId`, `allowedPortIds`.
3. Build **`Output.object({ schema })`** from the `ai` package (same pattern as memories adapter output builders).
4. **`createNegotiationAgent`** from [`packages/obp/agent-runtime/src/create-agent.ts`](packages/obp/agent-runtime/src/create-agent.ts):
   - **Model**: `createGoogleGenerativeAI({ apiKey }).languageModel(...)` (shared helper mirroring obp examples `env.ts`).
   - **Identity / affordances**: minimal empty toolkit via `evaluateRegisteredAgentAffordances` + `createRegisteredAgentIdentity` + empty composable (equivalent to negotiator wiring but **no OBP tools** in the root composable)—match existing repo patterns from [`packages/agent/identity`](packages/agent/identity) tests or [`packages/obp/agents/negotiator`](packages/obp/agents/negotiator) for how `ToolRuntimeContext` is constructed.
   - **Instructions**: short negotiator system copy + **optional** one-shot summary of bindable ports / head offer (from snapshot or `allowedPortIds`), aligned with [agent-runtime README](packages/obp/agent-runtime/README.md) (noop/walk-away semantics, minimal sufficient ports).
5. **`await agent.generate({ messages })`** with at least one user message carrying **session context** (party name, prior audits text, or compact graph summary) so the model can choose a legal `portId`.
6. Read **structured output** from the generation result (AI SDK 6 shape used elsewhere in repo—mirror `createMemorySearchToolLoopAgent` / negotiator consumers).
7. **`runtime.applyTurn(actingPartyId, structuredOutput)`**; append **`NegotiationTurnAudit`** to server log.

If validation fails (model emits illegal `portId`), return **`400`** with error details (do not apply).

## Graph snapshot

- Reuse the planned **`buildGraphSnapshot(fake: FakeObpPersistence, client: ObpClient)`** approach (public maps on fake + `listBinds` / `listExposedPortEdges` / `getExtendingPartyId`).
- Use the same JSON for **`/api/state`** and, if useful, a **text bullet list** embedded in the LLM user message for grounding.

## Client (`index.html` + `ui.ts`)

- On load: **`fetch('/api/health')`**, then **`fetch('/api/state')`**.
- If `llmReady === false`, show static text: set env var and restart (no key input in browser).
- Render DAG (SVG layers as in prior plan) + audit table from `/api/state`.
- One control per party (or a single “next turn” if server fixes alternation): **`fetch('/api/negotiation/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actingPartyId }) })`**, then refresh state on success; show error JSON on failure.

## Wiring / files

- [`examples/index.ts`](packages/obp/agent-runtime/examples/index.ts): `Bun.serve` — route `/` → `index.html` import; implement `fetch` handlers for `/api/*` (or use `routes` + `fetch` fallback like [`apps/matchmaking/src/index.ts`](apps/matchmaking/src/index.ts)).
- New: `examples/graph-snapshot.ts`, `examples/llm-env.ts` (or inline minimal copy of obp `resolveGeminiApiKey`), `examples/index.html`, `examples/ui.ts`.
- **Dependencies**: add to [`packages/obp/agent-runtime/package.json`](packages/obp/agent-runtime/package.json) (or a dedicated `examples/package.json` only if you split workspace—prefer **single package** deps to avoid workspace glob changes): `@ai-sdk/google`, ensure `ai` version matches repo (^6).

## Out of scope

- Passing API key from browser, SQLite persistence, matchmaking app wiring.
