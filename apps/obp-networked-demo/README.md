# OBP networked demo (two processes)

Minimal two-process OBP demo using **invite-based auth**: the server signs a session invite with its own Ed25519 key at bootstrap time; the client presents it as `Authorization: Bearer …`; the server verifies with `verifyInvite(token, signer.actor)` — no shared secret.

Each process holds its own [`FakeObpPersistence`](../../packages/obp/core/src/testing/fake-obp-persistence.ts). The server hydrates its store from the verified session init on first connect.

## Setup

```sh
bun install
bun run bootstrap
```

Writes two gitignored files:

- **`.obp-demo-server.local.json`** — responder Ed25519 JWK only. No session params, no client keys.
- **`.obp-demo-client.local.json`** — initiator JWK, `parties`, `init`, `serverActorHex`, `inviteToken`.

Override paths with `OBP_DEMO_SERVER_BOOTSTRAP` / `OBP_DEMO_CLIENT_BOOTSTRAP`.

## Run

**Terminal A:**
```sh
bun run server
```

**Terminal B:**
```sh
bun run client
```

### Agent-driven (Gemini)

Requires `GOOGLE_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY`). Uses `@khoralabs/obp-agent-runtime` structured bilateral contract, **`auditToTurnBody`** for wire turns, and the same **`@khoralabs/obp-negotiator`** structured session path as [`packages/obp/agents/runtime/examples`](../../packages/obp/agents/runtime/examples): **`createAgentRegistry`** + **`ensureObpNegotiatorStructuredAgentRegistered`** (`scripts/network-negotiator-setup.ts`), then **`registry.createSession`** → **`generateObject`** inside the negotiator runner.

**Terminal A:** `bun run agent-server`  
**Terminal B:** `bun run agent-client`

Optional: `OBP_NEGOTIATION_MODEL`, `OBP_AGENT_SCENARIO` (joint scenario passed into `createNegotiationStructuredBilateralContract`), `OBP_AGENT_TURN_BUDGET_MS` (wall-clock cap per turn for structured `generateObject`; default **300000** ms, same idea as the runtime example timeouts).

## Auth flow

```
bootstrap time:   server signs invite = Ed25519(serverKey, { session, nonce, issuedAt })
                  invite token written to client bootstrap (no secret on server disk)

connect time:     client → Authorization: Bearer <inviteToken>
                  server → verifyInvite(token, signer.actor)  ✓  no shared secret
```

The server's OBP actor hex is the trust anchor. Anyone who pins it can verify future invites.

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `OBP_DEMO_SERVER_BOOTSTRAP` | `.obp-demo-server.local.json` | Responder key (server only) |
| `OBP_DEMO_CLIENT_BOOTSTRAP` | `.obp-demo-client.local.json` | Initiator key + invite token |
| `OBP_HOST` / `OBP_PORT` | `127.0.0.1` / `8765` | Server bind |
| `OBP_URL` | `http://127.0.0.1:8765` | Client URL |
| `OBP_NEGOTIATION_MODEL` | `gemini-flash-lite-latest` | Agent demo (`agent-server` / `agent-client`) model slug |
| `OBP_AGENT_SCENARIO` | (built-in strings in scripts) | Joint scenario for `createNegotiationStructuredBilateralContract` |
| `OBP_AGENT_TURN_BUDGET_MS` | `300000` | Per-turn wall-clock budget for negotiator structured `generateObject` |
