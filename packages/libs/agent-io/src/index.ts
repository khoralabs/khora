/**
 * Shared transport primitives — keep this package tiny and dependency-light.
 */
export type {
  DuplexByteStream,
  WebSocketDuplexByteSend,
} from "@khoralabs/duplex-byte-stream";
export {
  createMemoryDuplexByteStreamPair,
  createWebSocketDuplexByteStream,
} from "@khoralabs/duplex-byte-stream";
