# `@khoralabs/at2-transport`

Transport helpers for **at2** clients: inbox WebSocket URL + frame parsing, signed unary HTTP (`createHttpAtriumUnaryTransport`), optional env-backed **`AtriumTransportBundle`**, and WebSocket-based duplex negotiation (`openWebSocketNegotiationDuplex`).

Depends on `@khoralabs/at2-auth`, `@khoralabs/at2-contracts`, and `@khoralabs/agent-relay` / `@khoralabs/agent-io` where types overlap.

Deployment mode for bundle selection: **`ATRIUM_TRANSPORT`** (`http` default).
