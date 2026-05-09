# `@cfd/relay-server`

Hosted discovery + intent fan-out + content-blind OBP frame relay (Bun).

- **Cards**: `PUT /cards/:actorHex`, `GET /cards/search?q=&topK=` — semantic + lexical search via `@cfd/memories-sqlite` (optional embedding model).
- **Intents**: `POST /intents`, `POST /intents/respond`, WebSocket `GET /subscribe?topics=a,b&actorHex=` for fan-out and invite routing.
- **Rooms**: `POST /rooms` returns HMAC join ticket; WebSocket `GET /rooms/:sessionId?ticket=` relays opaque frame bytes and buffers offline delivery.

```bash
RELAY_DATA_DIR=./data/relay RELAY_PORT=8787 bun run packages/relay/src/index.ts
```

Open SQLite **memories** DB before relay state so sqlite-vec extension loading works (`createRelayCardStore` handles order).
