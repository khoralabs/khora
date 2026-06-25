# `@khoralabs/khora-transport`

Transport helpers for **khora** clients: inbox WebSocket URL + frame parsing, signed unary HTTP (`createHttpKhoraUnaryTransport`), optional env-backed **`KhoraTransportBundle`**, and WebSocket-based duplex negotiation (`openWebSocketNegotiationDuplex`).

Deployment mode for bundle selection: **`KHORA_TRANSPORT`** (`http` default).
