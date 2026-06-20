import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { isValidIanaTimeZone } from "../../agents/turn-context/user-local-datetime";
import { canReadThread } from "../authz";
import { getDb } from "../db/index";
import { getSession, getThread, userHasSessionAccess } from "../db/sessions";
import { findUserByRegistryId } from "../identity/users";
import { getDefaultTurnEngine } from "../interview/turn-engine";
import { logger } from "../logger";
import { getRegistryUrl } from "../registry-url";
import { withSpan } from "../telemetry/spans";

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
  return withSpan("ws.interview.upgrade", { "thread.id": threadId }, async (span) => {
    const session = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
    if (session === null) {
      span.setAttribute("ws.upgrade.denied", "unauthorized");
      logger.warn({ threadId, reason: "unauthorized" }, "interview ws upgrade denied");
      return { ok: false as const, status: 401, error: "Unauthorized" };
    }

    const db = getDb();
    const user = findUserByRegistryId(db, session.user.id);
    if (user === null) {
      span.setAttribute("ws.upgrade.denied", "user_not_provisioned");
      logger.warn({ threadId, reason: "user_not_provisioned" }, "interview ws upgrade denied");
      return { ok: false as const, status: 403, error: "User not provisioned" };
    }

    const thread = getThread(db, threadId);
    if (thread === null) {
      span.setAttribute("ws.upgrade.denied", "thread_not_found");
      logger.warn({ threadId, reason: "thread_not_found" }, "interview ws upgrade denied");
      return { ok: false as const, status: 404, error: "Thread not found" };
    }
    if (thread.kind !== "interview" || !canReadThread(db, user.id, threadId)) {
      span.setAttribute("ws.upgrade.denied", "forbidden");
      logger.warn(
        { threadId, userId: user.id, reason: "forbidden" },
        "interview ws upgrade denied",
      );
      return { ok: false as const, status: 403, error: "Forbidden" };
    }

    const sessionRecord = getSession(db, thread.session_id);
    if (sessionRecord === null) {
      span.setAttribute("ws.upgrade.denied", "session_not_found");
      logger.warn({ threadId, reason: "session_not_found" }, "interview ws upgrade denied");
      return { ok: false as const, status: 404, error: "Session not found" };
    }
    if (!userHasSessionAccess(db, thread.session_id, user.id)) {
      span.setAttribute("ws.upgrade.denied", "session_forbidden");
      logger.warn(
        { threadId, userId: user.id, reason: "session_forbidden" },
        "interview ws upgrade denied",
      );
      return { ok: false as const, status: 403, error: "Forbidden" };
    }

    span.setAttribute("user.id", user.id);
    logger.info({ threadId, userId: user.id }, "interview ws connected");
    return { ok: true as const, data: { threadId, userId: user.id } };
  });
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

  logger.debug({ threadId: data.threadId, messageType: parsed.type }, "interview ws message");

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
    logger.info(
      { threadId: ws.data.threadId, userId: ws.data.userId },
      "interview ws disconnected",
    );
    getDefaultTurnEngine().releaseThread(ws.data.threadId);
  },
};
