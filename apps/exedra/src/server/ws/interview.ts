import { verifyRegistrySession } from "@khoralabs/registry-auth";
import { nanoid } from "nanoid";
import { getDb } from "../db/index";
import { getSession, getThread, userHasSessionAccess } from "../db/sessions";
import { findUserByRegistryId } from "../identity/users";
import { ensureInterviewKickoff, runInterviewUserTurn } from "../interview/turn";
import { getRegistryUrl } from "../registry-url";

export type InterviewWsData = {
  threadId: string;
  userId: string;
};

type InterviewWs = {
  send: (data: string) => void;
  data: InterviewWsData;
};

type ClientMessage =
  | { type: "user_message"; text: string; documentIds?: string[] }
  | { type: "ping" };

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
  if (!userHasSessionAccess(db, thread.session_id, user.id)) {
    return { ok: false, status: 403, error: "Forbidden" };
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
  const documentIds = (parsed.documentIds ?? []).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  if (text.length === 0 && documentIds.length === 0) {
    ws.send(JSON.stringify({ type: "error", error: "Empty message" }));
    return;
  }

  const db = getDb();
  const thread = getThread(db, data.threadId);
  if (thread === null) return;

  const sessionRecord = getSession(db, thread.session_id);
  if (sessionRecord === null) return;

  const result = await runInterviewUserTurn({
    db,
    ws,
    threadId: data.threadId,
    session: sessionRecord,
    text,
    userMessageId: nanoid(),
    documentIds,
  });

  if (!result.ok) {
    ws.send(JSON.stringify({ type: "error", error: result.error }));
  }
}

export const interviewWsHandlers = {
  open(ws: InterviewWs) {
    ws.send(JSON.stringify({ type: "ready", threadId: ws.data.threadId }));
    void ensureInterviewKickoff(getDb(), ws, ws.data.threadId);
  },
  message(ws: InterviewWs, raw: string | Buffer) {
    void handleInterviewWsMessage(ws, ws.data, raw);
  },
};
