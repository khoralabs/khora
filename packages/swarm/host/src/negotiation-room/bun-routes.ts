import type { ServerWebSocket } from "bun";
import type { NegotiationRoomHubPort, NegotiationRoomPeer } from "./port.ts";

/** WebSocket `data` after upgrade for negotiation byte-relay rooms. */
export type SwarmNegotiationRoomWsData = { kind: "room"; sessionId: string };

function peerFromWebSocket(ws: ServerWebSocket<SwarmNegotiationRoomWsData>): NegotiationRoomPeer {
  return {
    send(bytes: Uint8Array) {
      ws.send(bytes);
    },
  };
}

export function swarmNegotiationRoomWebSocketHandlers(deps: { hub: NegotiationRoomHubPort }): {
  open(ws: ServerWebSocket<SwarmNegotiationRoomWsData>): void;
  close(ws: ServerWebSocket<SwarmNegotiationRoomWsData>): void;
  message(ws: ServerWebSocket<SwarmNegotiationRoomWsData>, message: string | Buffer): void;
} {
  const peerByWs = new WeakMap<ServerWebSocket<SwarmNegotiationRoomWsData>, NegotiationRoomPeer>();

  return {
    open(ws) {
      const d = ws.data;
      const peer = peerFromWebSocket(ws);
      peerByWs.set(ws, peer);
      void deps.hub.attachPeer(d.sessionId, peer);
    },
    close(ws) {
      const d = ws.data;
      const peer = peerByWs.get(ws);
      if (peer !== undefined) {
        deps.hub.detachPeer(d.sessionId, peer);
      }
    },
    message(ws, message) {
      const d = ws.data;
      const peer = peerByWs.get(ws);
      if (peer === undefined) {
        return;
      }
      let bytes: Uint8Array;
      if (typeof message === "string") {
        bytes = new TextEncoder().encode(message);
      } else if (message instanceof ArrayBuffer) {
        bytes = new Uint8Array(message);
      } else {
        bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
      }
      deps.hub.relayBytes(d.sessionId, peer, bytes);
    },
  };
}
