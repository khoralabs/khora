import { type ServerWebSocket, serve } from "bun";
import { chatInternalToken } from "./config";
import { createChatRoutesWithParams, dispatchChatRoute, requireInternalToken } from "./routes";
import { getChatService, initChatStorage, subscribeToChatThread } from "./service";

const token = chatInternalToken();
await initChatStorage();
const routes = createChatRoutesWithParams(getChatService(), token);
const port = Number(process.env.PORT?.trim() || "3002");

type WsData = {
  threadId: string;
  unsubscribe?: () => void;
};

serve<WsData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/ws/threads/")) {
      const authError = requireInternalToken(req, token);
      if (authError !== null) return authError;
      const threadId = decodeURIComponent(url.pathname.slice("/ws/threads/".length));
      if (threadId.length === 0) {
        return Response.json({ error: "threadId is required" }, { status: 400 });
      }
      const upgraded = server.upgrade(req, { data: { threadId } satisfies WsData });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return dispatchChatRoute(routes, req);
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      ws.data.unsubscribe = subscribeToChatThread(ws.data.threadId, (event) => {
        ws.send(JSON.stringify(event));
      });
    },
    message() {},
    close(ws: ServerWebSocket<WsData>) {
      ws.data.unsubscribe?.();
    },
  },
});

console.log(`chat service listening on ${port}`);
