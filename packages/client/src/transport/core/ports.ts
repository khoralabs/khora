/**
 * Client transport ports (declarations).
 *
 * - {@link KhoraHttpUnaryTransport} — explicitly HTTP-shaped signed RPC
 * - {@link KhoraDuplexTransport} — duplex adapter owns connection credentials
 *
 * Implementations live under `../http` (unary) and `../websocket` (duplex/inbox).
 */

export type { ConnectInboxCall, KhoraDuplexTransport } from "../duplex-ws";
export type {
  KhoraHttpUnaryTransport,
  KhoraUnaryTransport,
} from "../unary-http";
