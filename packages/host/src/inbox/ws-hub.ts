import type { InboxFanoutPort, InboxWebSocket } from "./fanout-port";

/** In-memory inbox hub keyed by DID (typical single-node host). */
export function createInboxWsHub(): InboxFanoutPort {
  const socketsByDid = new Map<string, Set<InboxWebSocket>>();
  const didsBySocket = new Map<InboxWebSocket, Set<string>>();

  function add(did: string, ws: InboxWebSocket): void {
    let set = socketsByDid.get(did);
    if (set === undefined) {
      set = new Set();
      socketsByDid.set(did, set);
    }
    set.add(ws);
    let dids = didsBySocket.get(ws);
    if (dids === undefined) {
      dids = new Set();
      didsBySocket.set(ws, dids);
    }
    dids.add(did);
  }

  function remove(did: string, ws: InboxWebSocket): void {
    const set = socketsByDid.get(did);
    if (set !== undefined) {
      set.delete(ws);
      if (set.size === 0) {
        socketsByDid.delete(did);
      }
    }
    const dids = didsBySocket.get(ws);
    if (dids !== undefined) {
      dids.delete(did);
      if (dids.size === 0) {
        didsBySocket.delete(ws);
      }
    }
  }

  function removeSession(ws: InboxWebSocket): void {
    const dids = didsBySocket.get(ws);
    if (dids === undefined) return;
    for (const did of [...dids]) {
      remove(did, ws);
    }
  }

  function broadcast(did: string, message: unknown): void {
    const set = socketsByDid.get(did);
    if (set === undefined) return;
    const tagged =
      message !== null && typeof message === "object" && !Array.isArray(message)
        ? { ...(message as Record<string, unknown>), did }
        : { type: "notification", did, payload: message };
    const payload = JSON.stringify(tagged);
    for (const ws of set) {
      ws.send(payload);
    }
  }

  function listenerCount(did: string): number {
    return socketsByDid.get(did)?.size ?? 0;
  }

  return { add, remove, removeSession, broadcast, listenerCount };
}
