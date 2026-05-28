# `@khoralabs/khora-transport`

Transport helpers for **khora** clients: inbox WebSocket URL + frame parsing, signed unary HTTP (`createHttpKhoraUnaryTransport`), optional env-backed **`KhoraTransportBundle`**, and WebSocket-based duplex negotiation (`openWebSocketNegotiationDuplex`).

Depends on `@khoralabs/khora-auth`, `@khoralabs/khora-contracts`, and `@khoralabs/agent-relay` / `@khoralabs/agent-io` where types overlap.

Deployment mode for bundle selection: **`KHORA_TRANSPORT`** (`http` default).
