import type { ServerWebSocket } from "bun";
import type { FrameChannelHubPort, FrameChannelPeer } from "./port.ts";

/** WebSocket `data` after upgrade for frame-channel hub sessions (product routes map `sessionId` to room id). */
export type SwarmFrameChannelWsData = { kind: "room"; sessionId: string };

function peerFromWebSocket(ws: ServerWebSocket<SwarmFrameChannelWsData>): FrameChannelPeer {
  return {
    send(bytes: Uint8Array) {
      ws.send(bytes);
    },
  };
}

export function swarmFrameChannelWebSocketHandlers(deps: { hub: FrameChannelHubPort }): {
  open(ws: ServerWebSocket<SwarmFrameChannelWsData>): void;
  close(ws: ServerWebSocket<SwarmFrameChannelWsData>): void;
  message(ws: ServerWebSocket<SwarmFrameChannelWsData>, message: string | Buffer): void;
} {
  const peerByWs = new WeakMap<ServerWebSocket<SwarmFrameChannelWsData>, FrameChannelPeer>();

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
