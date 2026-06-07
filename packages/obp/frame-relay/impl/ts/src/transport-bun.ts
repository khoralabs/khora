import type { ServerWebSocket } from "bun";
import type { FrameRelayHubPort, FrameRelayPeer } from "./hub-port";

/** WebSocket `data` after upgrade for frame relay hub sessions (routes map `sessionId` to channel id). */
export type FrameRelayHubWsData = { kind: "room"; sessionId: string };

function peerFromWebSocket(ws: ServerWebSocket<FrameRelayHubWsData>): FrameRelayPeer {
  return {
    send(bytes: Uint8Array) {
      ws.send(bytes);
    },
  };
}

export function frameRelayHubWebSocketHandlers(deps: { hub: FrameRelayHubPort }): {
  open(ws: ServerWebSocket<FrameRelayHubWsData>): void;
  close(ws: ServerWebSocket<FrameRelayHubWsData>): void;
  message(ws: ServerWebSocket<FrameRelayHubWsData>, message: string | Buffer): void;
} {
  const peerByWs = new WeakMap<ServerWebSocket<FrameRelayHubWsData>, FrameRelayPeer>();

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
