/** DID-signed HTTP control-plane headers (same wire as Khora). */
export const AGENT_REQUEST_HEADER = {
  did: "X-Agent-Did",
  ts: "X-Agent-Timestamp",
  nonce: "X-Agent-Nonce",
  sig: "X-Agent-Signature",
} as const;

/** Channel-relay HTTP / WebSocket upgrade headers. */
export const VELLUM_HTTP_HEADER = {
  upgradeNonce: "X-Vellum-Upgrade-Nonce",
  secWebSocketProtocol: "Sec-WebSocket-Protocol",
  contentLength: "Content-Length",
  xRealIp: "X-Real-IP",
  xForwardedFor: "X-Forwarded-For",
} as const;
