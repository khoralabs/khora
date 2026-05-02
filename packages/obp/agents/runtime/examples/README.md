# OBP agent-runtime examples (LLM)

Tiny **Bun** server with multiple **scenarios**, each with its own HTML entry and **namespaced API**. Uses in-memory `FakeObpPersistence` (not SQLite), **Gemini** structured turns via the bilateral coordinator contract, and [**React Flow**](https://reactflow.dev/api-reference) (`@cfd/obp-react`) for the negotiation DAG.

The UI libraries (`react`, `react-dom`, `@xyflow/react`) are **`devDependencies`** of this package—they are **not** imported by the library entrypoint. Run `bun install` without **`--production`** so `bun run example` can bundle the UI.

## Requirements

- **API key (server-side only)** — one of:
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `GOOGLE_API_KEY`
  - `GEMINI_API_KEY`

Optional:

- `OBP_NEGOTIATION_MODEL` (default `gemini-flash-lite-latest`).
- **`NEGOTIATION_FIRST`** — `buyer` or `seller` (default **`seller`**). Applies to **every** scenario session: that party opens when the graph is empty.

Never put the key in the browser; each scenario UI only calls same-origin APIs under its prefix.

## Run

From [`packages/obp/agents/runtime`](../):

```sh
bun run example
```

Open the printed URLs (default port **3456**; override with `PORT`):

- **`/`** — home page listing scenarios
- **`/scenarios/bilateral`** — bilateral pilot delivery (original demo narrative)
- **`/scenarios/intent-overlap`** — overlapping vs differing intents narrative
- **`/scenarios/matchmaking`** — stranger matchmaking; progressive disclosure toward a meet decision

## Layout

| Path | Role |
|------|------|
| [`routes/index.html`](routes/index.html) / [`routes/main.tsx`](routes/main.tsx) | Home |
| [`scenarios/<slug>/index.html`](scenarios/bilateral/index.html) | Per-scenario shell |
| [`scenarios/<slug>/main.tsx`](scenarios/bilateral/main.tsx) | Mounts [`shared/negotiation-app.tsx`](shared/negotiation-app.tsx) with `apiBase` |
| [`scenarios/<slug>/scenario.ts`](scenarios/bilateral/scenario.ts) | Prompt copy for that scenario |
| [`shared/negotiation-scenario-session.ts`](shared/negotiation-scenario-session.ts) | Shared server session factory |

## HTTP API (per scenario)

Replace `<slug>` with `bilateral`, `intent-overlap`, or `matchmaking`. Each slug has **isolated** session state (separate parties, ledger, mutex).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/scenarios/<slug>/health` | `{ "llmReady": boolean }` |
| `GET` | `/api/scenarios/<slug>/state` | Graph snapshot, audits, `partyIds`, `partyDisplayNames`, `nextTurn`, etc. |
| `POST` | `/api/scenarios/<slug>/negotiation/turn` | Body: `{ "actingPartyId": "<uuid>" }`. Same errors as before (`wrong_turn_party`, `llm_not_configured`, …). |
| `POST` | `/api/scenarios/<slug>/negotiation/reset` | Resets **only** that slug’s session. |

The UI exposes two party buttons whose labels come from **`partyDisplayNames`** in state (defaults **Buyer** / **Seller**; scenarios may override). Click the **highlighted** party once to **auto-run** remaining turns until completion or error. Turn errors such as `wrong_turn_party` may include an **`expectedParty`** string using that display name.

## Behaviour

- **Port TTL:** `allowAgentPortTtl: false`, `defaultPortTtl: { basis: "turns", measure: 1 }` — same as the former single-demo server.
- **Bind choice:** unchanged structured-output rules (`obp:bind`, policy-shaped objects, terminal binds omit `ports`).
- **Scenario copy:** lives under each [`scenarios/<slug>/scenario.ts`](scenarios/bilateral/scenario.ts); injected into contract user message and party identities.
- **Agreement:** terminal **real** bind sets `agreementReached` and ends negotiation for that slug only.
- **Concurrency:** each slug has its own turn mutex; different scenarios can be used from different tabs without sharing graph state.

## Policy (not in this demo)

Future hosts may gate which ports may be exposed; this example does not validate `portType` strings.
