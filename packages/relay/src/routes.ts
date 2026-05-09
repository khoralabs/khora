import type { Server, ServerWebSocket } from "bun";
import type { AgentCard, RelayCardStore } from "./card-store.ts";
import type { IntentFanout, IntentMessage, InviteResponse } from "./intent-fanout.ts";
import type { RelayWsData } from "./relay-ws-data.ts";
import type { RelayRoomHub } from "./room.ts";

export type { RelayWsData } from "./relay-ws-data.ts";

export type RelayRouteDeps = {
  cardStore: RelayCardStore;
  intents: IntentFanout;
  rooms: RelayRoomHub;
};

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

/** HTTP + WebSocket routing for the relay. */
export function createRelayFetchHandler(deps: RelayRouteDeps) {
  return async function relayFetch(
    req: Request,
    server: Server<RelayWsData>,
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
      const ok = await deps.rooms.verifyTicket(sessionId, ticket);
      if (!ok) {
        return json({ error: "invalid ticket" }, 401);
      }
      const upgraded = server.upgrade(req, {
        data: { kind: "room", sessionId } satisfies RelayWsData,
      });
      if (!upgraded) {
        return json({ error: "upgrade failed" }, 500);
      }
      return undefined;
    }

    if (
      url.pathname === "/subscribe" &&
      req.headers.get("upgrade")?.toLowerCase() === "websocket"
    ) {
      const topicsRaw = url.searchParams.get("topics") ?? "";
      const topics = topicsRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const actorHex = url.searchParams.get("actorHex")?.trim() ?? "";
      if (topics.length === 0 || actorHex.length === 0) {
        return json({ error: "topics and actorHex required" }, 400);
      }
      const upgraded = server.upgrade(req, {
        data: { kind: "intent", topics, actorHex } satisfies RelayWsData,
      });
      if (!upgraded) {
        return json({ error: "upgrade failed" }, 500);
      }
      return undefined;
    }

    if (req.method === "GET" && url.pathname === "/cards/search") {
      const q = url.searchParams.get("q") ?? "";
      const topK = Number(url.searchParams.get("topK") ?? "8");
      const hits = await deps.cardStore.searchCards(q, Number.isFinite(topK) ? topK : 8);
      return json({ cards: hits });
    }

    if (req.method === "PUT" && url.pathname.startsWith("/cards/")) {
      const actorHex = decodeURIComponent(url.pathname.slice("/cards/".length).replace(/\/$/, ""));
      if (actorHex.length === 0) {
        return json({ error: "missing actorHex" }, 400);
      }
      const body = await readJson<Partial<AgentCard>>(req);
      if (body === null) {
        return json({ error: "invalid JSON" }, 400);
      }
      const card: AgentCard = {
        actorHex,
        displayName: String(body.displayName ?? ""),
        tagline: String(body.tagline ?? ""),
        about: String(body.about ?? ""),
        relayEndpoint: String(body.relayEndpoint ?? ""),
      };
      await deps.cardStore.upsertCard(card);
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/intents") {
      const body = await readJson<IntentMessage>(req);
      if (body === null || body.type !== "intent") {
        return json({ error: "invalid intent body" }, 400);
      }
      deps.intents.publishIntent(body);
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/intents/respond") {
      const body = await readJson<InviteResponse>(req);
      if (body === null || body.type !== "invite_response") {
        return json({ error: "invalid invite_response body" }, 400);
      }
      deps.intents.routeInviteResponse(body);
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/rooms") {
      const body = await readJson<{ sessionId?: string; ttlMs?: number }>(req);
      if (body === null || typeof body.sessionId !== "string" || body.sessionId.length === 0) {
        return json({ error: "sessionId required" }, 400);
      }
      const ttlMs =
        typeof body.ttlMs === "number" && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined;
      const { ticket } = await deps.rooms.createRoom(body.sessionId, ttlMs);
      return json({ sessionId: body.sessionId, ticket });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  };
}

export function relayWebSocketHandlers(deps: RelayRouteDeps): {
  open(ws: ServerWebSocket<RelayWsData>): void;
  close(ws: ServerWebSocket<RelayWsData>): void;
  message(ws: ServerWebSocket<RelayWsData>, message: string | Buffer): void;
} {
  return {
    open(ws) {
      const d = ws.data;
      if (d.kind === "intent") {
        deps.intents.attachSubscriber(ws, d.topics, d.actorHex);
      } else {
        void deps.rooms.attachPeer(d.sessionId, ws);
      }
    },
    close(ws) {
      const d = ws.data;
      deps.intents.detachSubscriber(ws);
      if (d.kind === "room") {
        deps.rooms.detachPeer(d.sessionId, ws);
      }
    },
    message(ws, message) {
      const d = ws.data;
      if (d.kind !== "room") {
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
      deps.rooms.relayBytes(d.sessionId, ws, bytes);
    },
  };
}
