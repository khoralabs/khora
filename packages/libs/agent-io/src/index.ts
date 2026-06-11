/**
 * Shared transport primitives — keep this package tiny and dependency-light.
 */
export type {
  DuplexByteStream,
  WebSocketDuplexByteSend,
} from "@khoralabs/obp-byte-stream";
export {
  createMemoryDuplexByteStreamPair,
  createWebSocketDuplexByteStream,
} from "@khoralabs/obp-byte-stream";
