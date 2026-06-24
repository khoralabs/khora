import { parseSessionChatThreadId } from "@khoralabs/exedra-chat/thread-ids";
import type { Server, ServerWebSocket } from "bun";
import { requireRegistrySessionResponse } from "../auth/require-session";
import { canReadThread } from "../authz";
import { getDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import { getChatServiceClient } from "./service-client";

type WsData = {
  threadId: string;
  unsubscribe?: () => void;
};

async function canReadChatThread(userId: string, chatThreadId: string): Promise<boolean> {
  const parsed = parseSessionChatThreadId(chatThreadId);
  if (parsed === null) return false;
  if (parsed.kind === "interview" && parsed.userId !== userId) return false;
  return canReadThread(userId, chatThreadId);
}

export async function handleChatThreadWebSocketUpgrade(
  req: Request,
  server: Server<WsData>,
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const prefix = "/ws/chat/threads/";
  if (!url.pathname.startsWith(prefix)) {
    return new Response("Not found", { status: 404 });
  }

  const threadId = decodeURIComponent(url.pathname.slice(prefix.length));
  if (threadId.length === 0) {
    return Response.json({ error: "threadId is required" }, { status: 400 });
  }

  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const user = await getOrCreateUser(
    getDb(),
    auth.session.user.id,
    auth.session.user.email ?? null,
  );
  if (!(await canReadChatThread(user.id, threadId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const upgraded = server.upgrade(req, { data: { threadId } satisfies WsData });
  if (upgraded) return undefined;
  return new Response("WebSocket upgrade failed", { status: 500 });
}

export const chatWebSocketHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    const chat = getChatServiceClient();
    ws.data.unsubscribe = chat.subscribeToThread(ws.data.threadId, (event) => {
      ws.send(JSON.stringify(event));
    });
  },
  message() {},
  close(ws: ServerWebSocket<WsData>) {
    ws.data.unsubscribe?.();
  },
};
