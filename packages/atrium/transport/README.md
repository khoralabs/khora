# `@khoralabs/atrium-transport`

Transport helpers for Atrium **clients**: inbox WebSocket URL + frame parsing, signed unary HTTP (`createHttpAtriumUnaryTransport`), optional env-backed **`AtriumTransportBundle`**, and WebSocket-based duplex negotiation (`openWebSocketNegotiationDuplex`).

Depends on `@khoralabs/atrium-auth`, `@khoralabs/atrium-contracts`, and `@khoralabs/agent-relay` / `@khoralabs/agent-io` where types overlap. The **`AtriumClient`** in `@khoralabs/atrium-client` is the primary consumer; this package splits out reusable wire/session pieces.

## Scripts

- `bun test` — unit tests
- `bun run typecheck` — `tsc --noEmit`

Public exports live in [`src/index.ts`](src/index.ts).
