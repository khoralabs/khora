import type { Database } from "bun:sqlite";
import { getChatService, isChatNotFound } from "../chat/service";
import { interviewChatThreadId } from "../chat/thread-ids";

export type InterviewStatus = "not_started" | "started" | "complete";

export type SessionPhase = "individual" | "synthesis" | "alignment" | "closed";

export function sessionPhaseFromStatus(status: string): SessionPhase {
  if (status === "alignment") return "alignment";
  if (status === "closed") return "closed";
  if (status === "synthesis") return "synthesis";
  return "individual";
}

export function formatDaysToDeadline(deadlineMs: number | null, nowMs = Date.now()): string | null {
  if (deadlineMs === null) return null;
  const msLeft = deadlineMs - nowMs;
  if (msLeft <= 0) return "Past due";
  const days = msLeft / (24 * 60 * 60 * 1000);
  if (days < 1) return "<1 day";
  return `${Math.ceil(days)} days`;
}

export async function getInterviewStatus(
  _db: Database,
  sessionId: string,
  userId: string,
): Promise<InterviewStatus> {
  const chat = getChatService();
  const threadId = interviewChatThreadId(sessionId, userId);
  try {
    await chat.getThread(threadId);
  } catch (error) {
    if (isChatNotFound(error)) return "not_started";
    throw error;
  }

  const { items } = await chat.listPosts({ threadId, limit: 100 });
  if (items.some((post) => post.role === "assistant" && post.metadata?.completion !== undefined)) {
    return "complete";
  }
  return items.some((post) => post.role === "user") ? "started" : "not_started";
}
