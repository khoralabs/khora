import type { Database } from "bun:sqlite";

import { ACTIVE_GRANT_SQL } from "../authz/active";
import { grantThreadAccess, hasSessionAccess, isSessionFacilitator } from "../authz/policy";
import { createOrgWithAdmin, createTeamWithGrants } from "./membership";

export { isTeamMember } from "./membership";

export type SessionKind = "standard" | "onboarding";
export type SessionLinkAccess = "restricted" | "anyone";

export type SessionRecord = {
  id: string;
  teamId: string;
  topic: string;
  deadlineMs: number | null;
  status: string;
  kind: SessionKind;
  createdAtMs: number;
  interviewSummary: string | null;
  nextSessionOptions: string[] | null;
  interviewCompletedAtMs: number | null;
};

type SessionRow = {
  id: string;
  team_id: string;
  topic: string;
  deadline_ms: number | null;
  status: string;
  kind: string;
  created_at_ms: number;
  interview_summary: string | null;
  next_session_options: string | null;
  interview_completed_at_ms: number | null;
};

function parseNextSessionOptions(raw: string | null): string[] | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    topic: row.topic,
    deadlineMs: row.deadline_ms,
    status: row.status,
    kind: row.kind === "onboarding" ? "onboarding" : "standard",
    createdAtMs: row.created_at_ms,
    interviewSummary: row.interview_summary ?? null,
    nextSessionOptions: parseNextSessionOptions(row.next_session_options ?? null),
    interviewCompletedAtMs: row.interview_completed_at_ms ?? null,
  };
}

export function buildOnboardingSessionTopic(orgName: string, teamName: string): string {
  return `Getting to know ${orgName} and ${teamName}`;
}

export async function createOrg(
  db: Database,
  params: { name: string; ownerId: string },
): Promise<string> {
  return createOrgWithAdmin(db, { name: params.name, creatorId: params.ownerId });
}

export function createTeam(
  db: Database,
  params: { orgId: string; name: string; ownerId: string },
): string {
  return createTeamWithGrants(db, {
    orgId: params.orgId,
    name: params.name,
    creatorId: params.ownerId,
  });
}

export function createSession(
  db: Database,
  params: {
    teamId: string;
    topic: string;
    deadlineMs?: number;
    kind?: SessionKind;
  },
): SessionRecord {
  const id = crypto.randomUUID();
  const now = Date.now();
  const kind = params.kind ?? "standard";
  db.prepare(
    `INSERT INTO sessions (
       id, team_id, topic, deadline_ms, status, kind, created_at_ms
     ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, params.teamId, params.topic, params.deadlineMs ?? null, kind, now);
  const row = db.query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`).get(id);
  if (row === null) throw new Error("session insert failed");
  return mapSession(row);
}

export function createOnboardingSession(
  db: Database,
  params: {
    teamId: string;
    orgName: string;
    teamName: string;
  },
): SessionRecord {
  return createSession(db, {
    teamId: params.teamId,
    topic: buildOnboardingSessionTopic(params.orgName, params.teamName),
    kind: "onboarding",
  });
}

export function closeSession(db: Database, sessionId: string): void {
  db.prepare(`UPDATE sessions SET status = 'closed' WHERE id = ?`).run(sessionId);
}

export function markSessionInterviewComplete(
  db: Database,
  sessionId: string,
  params: { summary: string; nextSessionOptions: string[] },
): SessionRecord | null {
  const completedAtMs = Date.now();
  db.prepare(
    `UPDATE sessions
     SET status = 'alignment',
         interview_summary = ?,
         next_session_options = ?,
         interview_completed_at_ms = ?
     WHERE id = ?`,
  ).run(params.summary.trim(), JSON.stringify(params.nextSessionOptions), completedAtMs, sessionId);
  return getSession(db, sessionId);
}

export function patchSession(
  db: Database,
  sessionId: string,
  params: { topic?: string; deadlineMs?: number | null },
): SessionRecord | null {
  const existing = getSession(db, sessionId);
  if (existing === null) return null;
  const topic = params.topic !== undefined ? params.topic : existing.topic;
  const deadlineMs = params.deadlineMs !== undefined ? params.deadlineMs : existing.deadlineMs;
  db.prepare(`UPDATE sessions SET topic = ?, deadline_ms = ? WHERE id = ?`).run(
    topic,
    deadlineMs,
    sessionId,
  );
  return getSession(db, sessionId);
}

export function getSession(db: Database, sessionId: string): SessionRecord | null {
  const row = db
    .query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  return row === null ? null : mapSession(row);
}

export function getInterviewThreadId(
  db: Database,
  params: { sessionId: string; userId: string },
): string | null {
  const row = db
    .query<{ id: string }, [string, string]>(
      `SELECT id FROM threads
       WHERE session_id = ? AND user_id = ? AND kind = 'interview'
       LIMIT 1`,
    )
    .get(params.sessionId, params.userId);
  return row?.id ?? null;
}

export function getOrCreateInterviewThread(
  db: Database,
  params: { sessionId: string; userId: string },
): string {
  const existing = db
    .query<{ id: string }, [string, string]>(
      `SELECT id FROM threads
       WHERE session_id = ? AND user_id = ? AND kind = 'interview'
       LIMIT 1`,
    )
    .get(params.sessionId, params.userId);

  if (existing !== null) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO threads (id, kind, session_id, user_id, created_at_ms, closed_at_ms)
     VALUES (?, 'interview', ?, ?, ?, NULL)`,
  ).run(id, params.sessionId, params.userId, Date.now());
  grantThreadAccess(db, params.userId, id);
  return id;
}

export function getThread(db: Database, threadId: string) {
  return db
    .query<{ id: string; kind: string; session_id: string; user_id: string | null }, [string]>(
      `SELECT id, kind, session_id, user_id FROM threads WHERE id = ? LIMIT 1`,
    )
    .get(threadId);
}

export type SessionListItem = SessionRecord & {
  role: "facilitator" | "participant";
};

type SessionListRow = SessionRow;

export function userHasSessionAccess(db: Database, sessionId: string, userId: string): boolean {
  return hasSessionAccess(db, userId, sessionId);
}

export function userHasAnyAccessibleSession(db: Database, userId: string): boolean {
  const nowMs = Date.now();
  const row = db
    .query<{ c: number }, [string, number]>(
      `SELECT COUNT(1) AS c FROM authz_grants ag
       WHERE ag.resource_type = 'session'
         AND ag.feature IN ('admin', 'participant')
         AND ag.revoked_at_ms IS NULL
         AND (ag.expired_at_ms IS NULL OR ag.expired_at_ms > ?2)
         AND (
           (ag.scope_type = 'account' AND ag.scope_id = ?1)
           OR (
             ag.scope_type = 'team'
             AND EXISTS (
               SELECT 1 FROM authz_grants tm
               WHERE tm.scope_type = 'account' AND tm.scope_id = ?1
                 AND tm.resource_type = 'team' AND tm.resource_id = ag.scope_id
                 AND tm.feature = 'member'
                 AND tm.revoked_at_ms IS NULL
                 AND (tm.expired_at_ms IS NULL OR tm.expired_at_ms > ?2)
             )
           )
         )`,
    )
    .get(userId, nowMs);
  return row !== null && row.c > 0;
}

export function listSessionsForUser(
  db: Database,
  userId: string,
  teamId?: string,
): SessionListItem[] {
  const nowMs = Date.now();
  const rows = db
    .query<SessionListRow, [string, string | null, number]>(
      `SELECT DISTINCT s.id, s.team_id, s.topic, s.deadline_ms,
              s.status, s.kind, s.created_at_ms
       FROM sessions s
       WHERE (?2 IS NULL OR s.team_id = ?2)
         AND (
           EXISTS (
             SELECT 1 FROM authz_grants ag
             WHERE ag.resource_type = 'session' AND ag.resource_id = s.id
               AND ag.feature IN ('admin', 'participant')
               AND ${ACTIVE_GRANT_SQL}
               AND (
                 (ag.scope_type = 'account' AND ag.scope_id = ?1)
                 OR (
                   ag.scope_type = 'team'
                   AND EXISTS (
                     SELECT 1 FROM authz_grants tm
                     WHERE tm.scope_type = 'account' AND tm.scope_id = ?1
                       AND tm.resource_type = 'team' AND tm.resource_id = ag.scope_id
                       AND tm.feature = 'member'
                       AND tm.revoked_at_ms IS NULL
                       AND (tm.expired_at_ms IS NULL OR tm.expired_at_ms > ?3)
                   )
                 )
               )
           )
         )
       ORDER BY s.created_at_ms DESC`,
    )
    .all(userId, teamId ?? null, nowMs);

  return rows.map((row) => ({
    ...mapSession(row),
    role: sessionRoleForUser(db, row.id, userId),
  }));
}

/**
 * Returns the session ID of the active (non-closed) onboarding session for a team, or null if none.
 * Used to avoid auto-creating a second onboarding session when new members join mid-onboarding.
 */
export function getActiveOnboardingSessionForTeam(db: Database, teamId: string): string | null {
  const row = db
    .query<{ id: string }, [string]>(
      `SELECT id FROM sessions
       WHERE team_id = ? AND kind = 'onboarding' AND status != 'closed'
       LIMIT 1`,
    )
    .get(teamId);
  return row?.id ?? null;
}

export function getSessionLinkAccess(db: Database, sessionId: string): SessionLinkAccess {
  const row = db
    .query<{ link_access: string }, [string]>(
      `SELECT link_access FROM sessions WHERE id = ? LIMIT 1`,
    )
    .get(sessionId);
  return row?.link_access === "anyone" ? "anyone" : "restricted";
}

export function setSessionLinkAccess(
  db: Database,
  sessionId: string,
  access: SessionLinkAccess,
): void {
  db.prepare(`UPDATE sessions SET link_access = ? WHERE id = ?`).run(access, sessionId);
}

export function sessionRoleForUser(
  db: Database,
  sessionId: string,
  userId: string,
): "facilitator" | "participant" {
  return isSessionFacilitator(db, userId, sessionId) ? "facilitator" : "participant";
}
