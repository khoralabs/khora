# Vellum channel-relay

Minimal Bun relay for ephemeral Vellum channels: DID-signed HTTP spawn API + frame-relay WebSocket hub.

## Run

```bash
bun run src/index.ts
```

Env:

- `PORT` — default `8790`
- `VELLUM_PUBLIC_BASE_URL` — public origin for `wss://` URLs behind a proxy

## API

- `POST /v1/channels` — create channel (returns `channelId`, `ticket`, `webSocketUrl`, `inviteToken`)
- `POST /v1/channels/join` — redeem `inviteToken`
- `POST /v1/channels/:channelId/ticket` — reconnect ticket
- `GET /v1/channels/:channelId/ws?ticket=` — WebSocket upgrade
- `GET /health` — `200 ok`

Auth: `X-Agent-*` headers (same wire as Khora). In-memory store only — restart drops channels.
