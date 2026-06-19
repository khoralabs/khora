import type { Database } from "bun:sqlite";

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

export function getInterviewStatus(
  db: Database,
  sessionId: string,
  userId: string,
): InterviewStatus {
  const thread = db
    .query<{ id: string; closed_at_ms: number | null }, [string, string]>(
      `SELECT id, closed_at_ms FROM threads
       WHERE session_id = ? AND user_id = ? AND kind = 'interview'
       LIMIT 1`,
    )
    .get(sessionId, userId);

  if (thread === null) return "not_started";
  if (thread.closed_at_ms !== null) return "complete";

  const row = db
    .query<{ c: number }, [string]>(
      `SELECT COUNT(1) AS c FROM messages WHERE thread_id = ? AND role = 'user'`,
    )
    .get(thread.id);

  return row !== null && row.c > 0 ? "started" : "not_started";
}
