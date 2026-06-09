# Vellum channel-relay

Bun HTTP + WebSocket server: **channel control plane** + OBP frame multiplex hub.

## Deployment profiles

See [`packages/vellum/spec/channel-relay-deployment.md`](../../../packages/vellum/spec/channel-relay-deployment.md).

| Profile | This app today |
|---------|----------------|
| **Canonical (single)** | One container = one `channel_id`; OOB single-use join tokens — **implemented** (`VELLUM_CHANNEL_ID`) |
| **Pool (default)** | Multi-tenant: `POST /v1/channels` spawns many channels in one process — **dev / CI** |

Orchestrator contract (Fly/k8s/Modal spawn → public URL): [`channel-orchestrator-contract.md`](../../../packages/vellum/spec/channel-orchestrator-contract.md).

## Run (pool / dev)

```bash
bun run src/index.ts
```

Env:

- `PORT` — default `8790`
- `VELLUM_PUBLIC_BASE_URL` — public origin for `wss://` URLs behind a proxy
- `VELLUM_RELAY_DB_PATH`, `VELLUM_SQLCIPHER_KEY` — encrypted registry + frame spool
- `VELLUM_RELAY_MAX_CHANNELS` — pool-wide channel cap (pool mode only)
- `VELLUM_RELAY_MODE=pool` — force pool when testing locally without `VELLUM_CHANNEL_ID`

## Run (single-channel / production)

Set `VELLUM_CHANNEL_ID` (and required companion env). The process boots one channel at startup; `POST /v1/channels` returns **501**.

| Env | Required | Description |
|-----|----------|-------------|
| `VELLUM_CHANNEL_ID` | yes | Fixed UUID for this container |
| `VELLUM_CHANNEL_CREATOR_DID` | yes | Bootstrap roster member |
| `VELLUM_CHANNEL_TTL_MS` | no | Default 24h (max 7d) |
| `VELLUM_MAX_POPULATION` | no | Roster cap; omit = unlimited |
| `VELLUM_MAX_CHAINS` | no | JSON, e.g. `{"mode":"principal","measure":8}` |
| `VELLUM_SQLCIPHER_KEY` | yes (prod) | DB encryption |
| `VELLUM_PUBLIC_BASE_URL` | yes (prod) | Public `wss://` origin (Fly app URL, ingress host) |

Example (Fly / k8s):

```bash
VELLUM_CHANNEL_ID=550e8400-e29b-41d4-a716-446655440000 \
VELLUM_CHANNEL_CREATOR_DID=did:example:creator \
VELLUM_PUBLIC_BASE_URL=https://vellum-relay-abc.fly.dev \
VELLUM_SQLCIPHER_KEY=... \
bun run src/index.ts
```

## API

**Single-channel:** join tokens only (no `open` / join-request routes). **Pool:** full admission modes via `POST /v1/channels`.

- `POST /v1/channels` — create channel (**pool only**; 501 in single mode)
- `POST /v1/channels/join` — redeem `joinToken` or `inviteToken` → roster + attach creds
- `POST /v1/channels/:channelId/join-tokens` — member: mint single-use join token
- `POST /v1/channels/:channelId/ticket` — member: ticket + upgrade nonce
- `POST /v1/channels/:channelId/ws-nonce` — member: upgrade nonce only
- `GET /v1/channels/:channelId/ws` — multiplex (`Sec-WebSocket-Protocol: vellum.nonce.<nonce>`)
- `POST /v1/channels/:channelId/chains/allocate` — bilateral chain slot (enforces `maxChains`)
- `GET /health` — `200 ok`

Auth: `X-Agent-*` headers (same wire as Khora).

Full route table: [`channel-control-protocol.md`](../../../packages/vellum/spec/channel-control-protocol.md).
