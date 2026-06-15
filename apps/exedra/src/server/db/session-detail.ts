import type { Database } from "bun:sqlite";

export type InterviewStatus = "not_started" | "started" | "complete";

export type SessionPhase = "individual" | "synthesis" | "alignment" | "closed";

export type SessionParticipantDetail = {
  userId: string;
  registryUserId: string;
  role: "facilitator" | "participant";
  interviewStatus: InterviewStatus;
};

type ParticipantRow = {
  user_id: string;
  registry_user_id: string;
  is_facilitator: number;
};

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

export function listSessionParticipantDetails(
  db: Database,
  sessionId: string,
  facilitatorId: string,
): SessionParticipantDetail[] {
  const rows = db
    .query<ParticipantRow, [string, string]>(
      `SELECT DISTINCT u.id AS user_id, u.registry_user_id,
              CASE WHEN u.id = ?2 THEN 1 ELSE 0 END AS is_facilitator
       FROM (
         SELECT ?2 AS user_id
         UNION
         SELECT user_id FROM session_participants WHERE session_id = ?1
         UNION
         SELECT consumed_by_user_id AS user_id FROM session_invites
         WHERE session_id = ?1 AND consumed_by_user_id IS NOT NULL
       ) ids
       JOIN users u ON u.id = ids.user_id
       ORDER BY is_facilitator DESC, u.created_at_ms ASC`,
    )
    .all(sessionId, facilitatorId);

  return rows.map((row) => ({
    userId: row.user_id,
    registryUserId: row.registry_user_id,
    role: row.is_facilitator === 1 ? "facilitator" : "participant",
    interviewStatus: getInterviewStatus(db, sessionId, row.user_id),
  }));
}
