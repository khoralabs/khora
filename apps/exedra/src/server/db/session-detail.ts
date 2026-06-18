import type { Database } from "bun:sqlite";

import { ACTIVE_GRANT_SQL } from "../authz/active";
import { listAccountIdsForTeam } from "../authz/grants";
import { Feature, ResourceType } from "../authz/policy";

export type InterviewStatus = "not_started" | "started" | "complete";

export type SessionPhase = "individual" | "synthesis" | "alignment" | "closed";

export type SessionParticipantDetail = {
  userId: string;
  registryUserId: string;
  role: "facilitator" | "participant";
  interviewStatus: InterviewStatus;
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

function listSessionParticipantUserIds(db: Database, sessionId: string): Map<string, boolean> {
  const nowMs = Date.now();
  const roles = new Map<string, boolean>();

  const accountRows = db
    .query<{ scope_id: string; feature: string }, [string, string, number]>(
      `SELECT scope_id, feature FROM authz_grants
       WHERE resource_type = ? AND resource_id = ?
         AND scope_type = 'account'
         AND feature IN ('admin', 'participant')
         AND ${ACTIVE_GRANT_SQL}`,
    )
    .all(ResourceType.Session, sessionId, nowMs);

  for (const row of accountRows) {
    const isFacilitator = row.feature === Feature.Admin;
    const existing = roles.get(row.scope_id);
    if (existing === true) continue;
    roles.set(row.scope_id, isFacilitator);
  }

  const teamRows = db
    .query<{ scope_id: string; feature: string }, [string, string, number]>(
      `SELECT scope_id, feature FROM authz_grants
       WHERE resource_type = ? AND resource_id = ?
         AND scope_type = 'team'
         AND feature IN ('admin', 'participant')
         AND ${ACTIVE_GRANT_SQL}`,
    )
    .all(ResourceType.Session, sessionId, nowMs);

  for (const teamRow of teamRows) {
    const isFacilitator = teamRow.feature === Feature.Admin;
    for (const accountId of listAccountIdsForTeam(db, teamRow.scope_id, Feature.Member, nowMs)) {
      const existing = roles.get(accountId);
      if (existing === true) continue;
      if (existing === false && !isFacilitator) continue;
      roles.set(accountId, isFacilitator);
    }
  }

  return roles;
}

export function listSessionParticipantDetails(
  db: Database,
  sessionId: string,
): SessionParticipantDetail[] {
  const participantRoles = listSessionParticipantUserIds(db, sessionId);
  if (participantRoles.size === 0) return [];

  const details: SessionParticipantDetail[] = [];
  for (const [userId, isFacilitator] of participantRoles) {
    const user = db
      .query<{ id: string; registry_user_id: string }, [string]>(
        `SELECT id, registry_user_id FROM users WHERE id = ? LIMIT 1`,
      )
      .get(userId);
    if (user === null) continue;
    details.push({
      userId: user.id,
      registryUserId: user.registry_user_id,
      role: isFacilitator ? "facilitator" : "participant",
      interviewStatus: getInterviewStatus(db, sessionId, user.id),
    });
  }

  details.sort((a, b) => {
    if (a.role !== b.role) return a.role === "facilitator" ? -1 : 1;
    return a.registryUserId.localeCompare(b.registryUserId);
  });

  return details;
}
