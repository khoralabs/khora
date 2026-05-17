# `@khoralabs/at2-transport`

Transport helpers for **at2** clients: inbox WebSocket URL + frame parsing, signed unary HTTP (`createHttpAtriumUnaryTransport`), optional env-backed **`AtriumTransportBundle`**, and WebSocket-based duplex negotiation (`openWebSocketNegotiationDuplex`).

Depends on `@khoralabs/at2-auth`, `@khoralabs/at2-contracts`, and `@khoralabs/agent-relay` / `@khoralabs/agent-io` where types overlap. A future **at2** client/host is the primary consumer; this package holds reusable wire/session pieces (`Atrium*` type names are retained for low churn).

## Scripts

- `bun test` — unit tests
- `bun run typecheck` — `tsc --noEmit`

Public exports live in [`src/index.ts`](src/index.ts).
