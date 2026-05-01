# OBP agent-runtime negotiation web example (LLM)

Tiny **Bun** server: in-memory `FakeObpPersistence` (not SQLite), **Gemini** structured turns via [`NegotiationRuntime`](../src/runtime.ts), and a **React** UI with [**React Flow**](https://reactflow.dev/api-reference) for the negotiation DAG (pan/zoom).

The UI libraries (`react`, `react-dom`, `@xyflow/react`) are **`devDependencies`** of this package—they are **not** imported by the library entrypoint. Run `bun install` without **`--production`** so `bun run example` can bundle the UI.

## Requirements

- **API key (server-side only)** — one of:
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `GOOGLE_API_KEY`
  - `GEMINI_API_KEY`

Optional:

- `OBP_NEGOTIATION_MODEL` (default `gemini-flash-lite-latest`).
- **`NEGOTIATION_FIRST`** — `buyer` or `seller` (default **`seller`**). That party takes the **opening** structured turn when the graph is empty (`extend` with no bind + `expose`). The other party responds next; turns then alternate.

Never put the key in the browser; the UI only calls same-origin HTTP APIs.

## Run

From [`packages/obp/agent-runtime`](../):

```sh
bun run example
```

Open the printed URL (default port **3456**; override with `PORT`).

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{ "llmReady": boolean }` |
| `GET` | `/api/state` | Graph snapshot, `audits` (per-turn bind menu vs choice), `partyIds`, `nextActorHint`, `nextTurn` (genesis vs bind options for the party whose move it is), `negotiationFirst`, `agreementReached`, etc. |
| `POST` | `/api/negotiation/turn` | Body: `{ "actingPartyId": "<uuid>" }`. Runs one Gemini turn for that party. **`400`** `wrong_turn_party` if it is not that party’s turn; **`503`** if no API key; **`422`** if structured output invalid. |

The UI exposes **Buyer** and **Seller** buttons. Click the **highlighted** party once to **auto-run** every remaining LLM turn until the negotiation ends, hits max turns, or errors—each step still posts that party’s id from server `nextTurn`.

## Behaviour

- **Port TTL (demo default):** the example runtime sets **`allowAgentPortTtl: false`** and **`defaultPortTtl: { basis: "turns", measure: 1 }`**, so the host pins a **one completed-turn** bind window per exposed port. The graph snapshot’s **`expired`** flag for ports uses that turn window as well as wall-clock `ts_expired`; the demo clock (`clock.t`) may stay nearly static, so turn-based expiry is what tightens the bind menu as turns advance.
- **Opening (no seed graph):** the first actor extends with **`bindPortId: ""`** and exposes ports they invent (`prepareGenesisTurn` / `applyGenesisTurn`). Later turns use **`prepareActingTurn`** → bind a counterparty port → extend → expose.
- **Bind choice:** structured bind turns use **`bindChoiceIndex`** (integer **0 … n−1**) aligned with the server's bind menu order—the LLM does **not** output opaque port ids; the host maps the index to `portId`.
- **Scenario:** shared joint goal and peer-authored `offerType` / `portType` strings live in [`scenario.ts`](scenario.ts) and are injected into agent instructions and each turn’s user message.
- **Common ground:** when the last completed turn is a **real** bind to a **terminal** port, `agreementReached` is true and **`negotiationEnded`** is also true (no further turns are offered; POST returns `negotiation_ended`).
- **Concurrency:** turns are serialized with an in-memory mutex so parallel POSTs cannot interleave graph updates.

## Policy (not in this demo)

Future hosts may gate which ports may be exposed; this example does not validate `portType` strings.
