# Exedra Chat Service

Internal Bun service for Exedra chat persistence and realtime fanout.

## Run

```bash
bun install
bun run start
```

Defaults to port `3002`. Configure via `.env.example`.

The Exedra app remains the public gateway: registry auth, authz checks, and browser websocket upgrades happen in the app, which proxies authorized traffic to this service using `EXEDRA_CHAT_SERVICE_URL`.

## Exports

- `@khoralabs/exedra-chat` — service helpers and thread ID utilities
- `@khoralabs/exedra-chat/client` — HTTP client for the app
- `@khoralabs/exedra-chat/routes` — internal route dispatch (for tests)
- `@khoralabs/exedra-chat/server` — standalone server entrypoint

## Browser transport

Browsers subscribe via the app websocket path:

`ws(s)://<app-host>/ws/chat/threads/:threadId`

The app validates the session and thread access, then relays events from the chat service.
