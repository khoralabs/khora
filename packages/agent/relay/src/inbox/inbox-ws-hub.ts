import type { InboxFanoutPort, InboxWebSocket } from "./inbox-fanout-port";

/** In-memory inbox hub keyed by DID (typical single-node host). */
export function createInboxWsHub(): InboxFanoutPort {
  const socketsByDid = new Map<string, Set<InboxWebSocket>>();

  function add(did: string, ws: InboxWebSocket): void {
    let set = socketsByDid.get(did);
    if (set === undefined) {
      set = new Set();
      socketsByDid.set(did, set);
    }
    set.add(ws);
  }

  function remove(did: string, ws: InboxWebSocket): void {
    const set = socketsByDid.get(did);
    if (set === undefined) return;
    set.delete(ws);
    if (set.size === 0) {
      socketsByDid.delete(did);
    }
  }

  function broadcast(did: string, message: unknown): void {
    const set = socketsByDid.get(did);
    if (set === undefined) return;
    const payload = JSON.stringify(message);
    for (const ws of set) {
      ws.send(payload);
    }
  }

  function listenerCount(did: string): number {
    return socketsByDid.get(did)?.size ?? 0;
  }

  return { add, remove, broadcast, listenerCount };
}
