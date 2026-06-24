import type { AppendPostInput, ChatEvent } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

import { requireRegistrySessionResponse } from "../auth/require-session";
import { canReadThread, canWriteFacilitationThread } from "../authz";
import { getDb } from "../db/index";
import {
  getOrCreateFacilitationThread,
  getOrCreateInterviewThread,
  userHasSessionAccess,
} from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { dispatchGenerateResponseForChat } from "./dispatch";
import { getChatService, subscribeToChatThread } from "./service";
import {
  ensureFacilitationChatThread,
  ensureInterviewChatThread,
  sessionChannelId,
} from "./session-chat";

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init);
}

async function requireUser(req: Request) {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { response: auth.response, userId: null };
  const user = await getOrCreateUser(
    getDb(),
    auth.session.user.id,
    auth.session.user.email ?? null,
  );
  return { response: null, userId: user.id };
}

function canReadChatThread(
  db: import("bun:sqlite").Database,
  userId: string,
  chatThreadId: string,
): boolean {
  const parts = chatThreadId.split(":");
  const sessionId = parts[1];
  const kind = parts[2];
  if (!sessionId || !kind) return false;
  if (kind === "interview") {
    const ownerUserId = parts.slice(3).join(":");
    if (ownerUserId !== userId) return false;
    return canReadThread(db, userId, getOrCreateInterviewThread(db, { sessionId, userId }));
  }
  if (kind === "facilitation") {
    return canReadThread(db, userId, getOrCreateFacilitationThread(db, sessionId));
  }
  return false;
}

export async function handleChatBootstrap(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  const db = getDb();
  const interview = await ensureInterviewChatThread({ db, sessionId, userId: auth.userId });
  const facilitation = await ensureFacilitationChatThread({ db, sessionId });
  return json({
    interviewThreadId: interview.chatThread.id,
    facilitationThreadId: facilitation.chatThread.id,
  });
}

export async function handleListChatPosts(req: Request, threadId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  if (!canReadChatThread(getDb(), auth.userId, threadId)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return json(await getChatService().listPosts({ threadId }));
}

export async function handleGetChatChannel(req: Request, channelId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  const sessionId = channelId.startsWith("session:") ? channelId.slice("session:".length) : "";
  if (sessionId.length === 0 || !userHasSessionAccess(getDb(), sessionId, auth.userId)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return json(await getChatService().getChannel(channelId));
}

export async function handleListChatThreads(req: Request, channelId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  const sessionId = channelId.startsWith("session:") ? channelId.slice("session:".length) : "";
  if (sessionId.length === 0 || !userHasSessionAccess(getDb(), sessionId, auth.userId)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return json(await getChatService().listThreads({ channelId: sessionChannelId(sessionId) }));
}

export async function handleAppendChatPost(req: Request, threadId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  const db = getDb();
  if (!canReadChatThread(db, auth.userId, threadId))
    return json({ error: "Forbidden" }, { status: 403 });

  const parts = threadId.split(":");
  const sessionId = parts[1];
  const kind = parts[2];
  if (sessionId && kind === "facilitation") {
    const legacyThreadId = getOrCreateFacilitationThread(db, sessionId);
    if (!canWriteFacilitationThread(db, auth.userId, legacyThreadId)) {
      return json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { message?: UIMessage; userTimeZone?: string };
  try {
    body = (await req.json()) as { message?: UIMessage; userTimeZone?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.message === undefined) return json({ error: "message is required" }, { status: 400 });

  const input: AppendPostInput = {
    threadId,
    author: { type: "account", id: auth.userId },
    message: body.message,
  };
  const result = await getChatService().appendPost(input);

  if (sessionId && kind === "interview") {
    try {
      await dispatchGenerateResponseForChat({
        legacyThreadId: getOrCreateInterviewThread(db, { sessionId, userId: auth.userId }),
        chatThreadId: threadId,
        userId: auth.userId,
        userTimeZone: body.userTimeZone,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message, post: result.post }, { status: 502 });
    }
  }

  return json(result.post);
}

export async function handleChatThreadEvents(req: Request, threadId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.response !== null || auth.userId === null) return auth.response;
  if (!canReadChatThread(getDb(), auth.userId, threadId))
    return json({ error: "Forbidden" }, { status: 403 });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ChatEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const unsubscribe = subscribeToChatThread(threadId, send);
      controller.enqueue(encoder.encode(": connected\n\n"));
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
    },
  });
}
