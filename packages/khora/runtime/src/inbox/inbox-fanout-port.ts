/** Minimal WebSocket surface for inbox attachment (Bun/browser compatible). */
export type InboxWebSocket = { send(data: string): number };

/** Registry + broadcast for agent inbox WebSocket fan-out. */
export type InboxFanoutPort = {
  add(did: string, ws: InboxWebSocket): void;
  remove(did: string, ws: InboxWebSocket): void;
  broadcast(did: string, message: unknown): void;
  listenerCount(did: string): number;
};
