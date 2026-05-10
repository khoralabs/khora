import type { Server, ServerWebSocket } from "bun";
import type { ObpRoomHubPort, ObpRoomPeer } from "./port.ts";

/** WebSocket `data` after upgrade for OBP byte relay rooms. */
export type SwarmObpRoomWsData = { kind: "room"; sessionId: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function peerFromWebSocket(ws: ServerWebSocket<SwarmObpRoomWsData>): ObpRoomPeer {
  return {
    send(bytes: Uint8Array) {
      ws.send(bytes);
    },
  };
}

/** HTTP + WebSocket routing for OBP relay rooms (relay `/rooms` parity). */
export function createSwarmObpRoomFetchHandler(deps: { hub: ObpRoomHubPort }) {
  return async function swarmObpRoomFetch(
    req: Request,
    server: Server<SwarmObpRoomWsData>,
  ): Promise<Response | undefined> {
    const url = new URL(req.url);

    if (
      url.pathname.startsWith("/rooms/") &&
      req.headers.get("upgrade")?.toLowerCase() === "websocket"
    ) {
      const sessionId = decodeURIComponent(url.pathname.slice("/rooms/".length).replace(/\/$/, ""));
      const ticket = url.searchParams.get("ticket") ?? "";
      if (sessionId.length === 0 || ticket.length === 0) {
        return json({ error: "missing sessionId or ticket" }, 400);
      }
      const ok = await deps.hub.verifyTicket(sessionId, ticket);
      if (!ok) {
        return json({ error: "invalid ticket" }, 401);
      }
      const upgraded = server.upgrade(req, {
        data: { kind: "room", sessionId } satisfies SwarmObpRoomWsData,
      });
      if (!upgraded) {
        return json({ error: "upgrade failed" }, 500);
      }
      return undefined;
    }

    if (req.method === "POST" && url.pathname === "/rooms") {
      const body = await readJson<{ sessionId?: string; ttlMs?: number }>(req);
      if (body === null || typeof body.sessionId !== "string" || body.sessionId.length === 0) {
        return json({ error: "sessionId required" }, 400);
      }
      const ttlMs =
        typeof body.ttlMs === "number" && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined;
      const { ticket } = await deps.hub.createRoom(body.sessionId, ttlMs);
      return json({ sessionId: body.sessionId, ticket });
    }

    return undefined;
  };
}

export function swarmObpRoomWebSocketHandlers(deps: { hub: ObpRoomHubPort }): {
  open(ws: ServerWebSocket<SwarmObpRoomWsData>): void;
  close(ws: ServerWebSocket<SwarmObpRoomWsData>): void;
  message(ws: ServerWebSocket<SwarmObpRoomWsData>, message: string | Buffer): void;
} {
  const peerByWs = new WeakMap<ServerWebSocket<SwarmObpRoomWsData>, ObpRoomPeer>();

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
