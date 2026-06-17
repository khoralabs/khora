import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { isValidIanaTimeZone } from "../../agents/turn-context/user-local-datetime";
import { getDb } from "../db/index";
import { getSession, getThread, userHasSessionAccess } from "../db/sessions";
import { findUserByRegistryId } from "../identity/users";
import { getDefaultTurnEngine } from "../interview/turn-engine";
import { getRegistryUrl } from "../registry-url";

export type InterviewWsData = {
  threadId: string;
  userId: string;
  timeZone?: string;
};

type InterviewWs = {
  send: (data: string) => void;
  data: InterviewWsData;
  close?: () => void;
};

type ClientMessage =
  | {
      type: "user_message";
      turnId: string;
      text: string;
      documentIds?: string[];
      timeZone?: string;
    }
  | { type: "abort_turn"; turnId: string }
  | { type: "client_context"; timeZone?: string }
  | { type: "ping" };

function applyClientTimeZone(data: InterviewWsData, timeZone: unknown): void {
  if (typeof timeZone !== "string") return;
  const trimmed = timeZone.trim();
  if (trimmed.length === 0 || !isValidIanaTimeZone(trimmed)) return;
  data.timeZone = trimmed;
}

function emit(ws: InterviewWs, event: unknown): void {
  ws.send(JSON.stringify(event));
}

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
  ws: InterviewWs,
  raw: string | Buffer,
): Promise<void> {
  const { data } = ws;
  const engine = getDefaultTurnEngine();
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as ClientMessage;
  } catch {
    emit(ws, { type: "error", error: "Invalid JSON" });
    return;
  }

  if (parsed.type === "ping") {
    emit(ws, { type: "pong" });
    return;
  }

  if (parsed.type === "client_context") {
    applyClientTimeZone(data, parsed.timeZone);
    await engine.runKickoffTurn({
      threadId: data.threadId,
      userTimeZone: data.timeZone,
      emit: (event) => emit(ws, event),
    });
    return;
  }

  if (parsed.type === "abort_turn") {
    engine.abortTurn({ threadId: data.threadId, turnId: parsed.turnId });
    return;
  }

  if (parsed.type !== "user_message") {
    emit(ws, { type: "error", error: "Unknown message type" });
    return;
  }

  applyClientTimeZone(data, parsed.timeZone);

  const result = engine.submitTurn({
    threadId: data.threadId,
    turnId: parsed.turnId,
    text: parsed.text,
    documentIds: parsed.documentIds,
    userTimeZone: data.timeZone,
    emit: (event) => emit(ws, event),
  });

  if (!result.ok) {
    emit(ws, { type: "error", error: result.error });
  }
}

export const interviewWsHandlers = {
  open(ws: InterviewWs) {
    emit(ws, { type: "ready", threadId: ws.data.threadId });
  },
  message(ws: InterviewWs, raw: string | Buffer) {
    void handleInterviewWsMessage(ws, raw);
  },
  close(ws: InterviewWs) {
    getDefaultTurnEngine().releaseThread(ws.data.threadId);
  },
};
