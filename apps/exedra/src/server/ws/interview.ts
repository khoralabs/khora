import { verifyRegistrySession } from "@khoralabs/registry-auth";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";

import { createModel, getAgentRegistry, runInterviewTurn } from "../../agents/index";
import { getDb } from "../db/index";
import { userAcceptedSessionInvite } from "../db/invites";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../db/messages";
import { getSession, getThread } from "../db/sessions";
import { findUserByRegistryId } from "../identity/users";
import { getRegistryUrl } from "../registry-url";

export type InterviewWsData = {
  threadId: string;
  userId: string;
};

type InterviewWs = {
  send: (data: string) => void;
  data: InterviewWsData;
};

type ClientMessage = { type: "user_message"; text: string } | { type: "ping" };

export async function verifyInterviewWsUpgrade(
  req: Request,
  threadId: string,
): Promise<{ ok: true; data: InterviewWsData } | { ok: false; status: number; error: string }> {
  const session = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (session === null) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const db = getDb();
  const user = findUserByRegistryId(db, session.user.id);
  if (user === null) {
    return { ok: false, status: 403, error: "User not provisioned" };
  }

  const thread = getThread(db, threadId);
  if (thread === null) {
    return { ok: false, status: 404, error: "Thread not found" };
  }
  if (thread.kind !== "interview" || thread.user_id !== user.id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const sessionRecord = getSession(db, thread.session_id);
  if (sessionRecord === null) {
    return { ok: false, status: 404, error: "Session not found" };
  }
  if (!userAcceptedSessionInvite(db, thread.session_id, user.id)) {
    return { ok: false, status: 403, error: "Invite not accepted" };
  }

  return { ok: true, data: { threadId, userId: user.id } };
}

export async function handleInterviewWsMessage(
  ws: { send: (data: string) => void },
  data: InterviewWsData,
  raw: string | Buffer,
): Promise<void> {
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as ClientMessage;
  } catch {
    ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
    return;
  }

  if (parsed.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
    return;
  }

  if (parsed.type !== "user_message") {
    ws.send(JSON.stringify({ type: "error", error: "Unknown message type" }));
    return;
  }

  const text = parsed.text.trim();
  if (text.length === 0) {
    ws.send(JSON.stringify({ type: "error", error: "Empty message" }));
    return;
  }

  const db = getDb();
  const thread = getThread(db, data.threadId);
  if (thread === null) return;

  const sessionRecord = getSession(db, thread.session_id);
  if (sessionRecord === null) return;

  const userMessageId = nanoid();
  const userIndex = nextMessageIndex(db, data.threadId);
  const userParts: UIMessage["parts"] = [{ type: "text", text }];
  insertMessage(db, {
    id: userMessageId,
    threadId: data.threadId,
    role: "user",
    parts: userParts,
    messageIndex: userIndex,
  });

  ws.send(
    JSON.stringify({
      type: "user_message_saved",
      message: { id: userMessageId, role: "user", parts: userParts },
    }),
  );

  const history = loadThreadMessages(db, data.threadId);
  const assistantId = nanoid();

  try {
    const { assistantParts, beliefFlags } = await runInterviewTurn({
      registry: getAgentRegistry(),
      model: createModel(),
      sessionId: sessionRecord.id,
      sessionMeta: {
        displayName: sessionRecord.displayName,
        topic: sessionRecord.topic,
        prompt: sessionRecord.prompt,
      },
      threadId: data.threadId,
      userMessageId,
      history,
      onTextDelta: (delta) => ws.send(JSON.stringify({ type: "text_delta", delta })),
      onBeliefFlag: (belief, sourceMessageId) =>
        ws.send(JSON.stringify({ type: "belief_flag", belief, sourceMessageId })),
    });

    const assistantIndex = nextMessageIndex(db, data.threadId);
    insertMessage(db, {
      id: assistantId,
      threadId: data.threadId,
      role: "assistant",
      parts: assistantParts.length > 0 ? assistantParts : [{ type: "text", text: "" }],
      messageIndex: assistantIndex,
      metadata: beliefFlags.length > 0 ? { beliefFlags } : undefined,
    });

    ws.send(
      JSON.stringify({
        type: "assistant_message",
        message: {
          id: assistantId,
          role: "assistant",
          parts: assistantParts,
          ...(beliefFlags.length > 0 ? { metadata: { beliefFlags } } : {}),
        },
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Interview agent failed";
    ws.send(JSON.stringify({ type: "error", error: msg }));
  }
}

export const interviewWsHandlers = {
  open(ws: InterviewWs) {
    ws.send(JSON.stringify({ type: "ready", threadId: ws.data.threadId }));
  },
  message(ws: InterviewWs, raw: string | Buffer) {
    void handleInterviewWsMessage(ws, ws.data, raw);
  },
};
