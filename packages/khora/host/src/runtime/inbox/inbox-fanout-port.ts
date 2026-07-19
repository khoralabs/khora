/** Minimal WebSocket surface for inbox attachment (Bun/browser compatible). */
export type InboxWebSocket = { send(data: string): number };

/** Registry + broadcast for agent inbox WebSocket fan-out (multiplex sessions). */
export type InboxFanoutPort = {
  /** Register `ws` as a live listener for `did` (same socket may be added for many DIDs). */
  add(did: string, ws: InboxWebSocket): void;
  /** Unregister `ws` for one DID. */
  remove(did: string, ws: InboxWebSocket): void;
  /** Unregister `ws` for every DID it was bound under. */
  removeSession(ws: InboxWebSocket): void;
  /**
   * Push a live frame to all sockets listening for `did`.
   * Ensures the JSON payload includes `did` (for multiplex clients).
   */
  broadcast(did: string, message: unknown): void;
  listenerCount(did: string): number;
};
