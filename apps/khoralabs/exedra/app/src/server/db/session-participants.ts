import type { Database } from "bun:sqlite";

import { getOrgIdForTeam } from "../authz/grants";

export function ensureSessionParticipant(
  db: Database,
  sessionId: string,
  userId: string,
  nowMs = Date.now(),
): void {
  db.prepare(
    `INSERT INTO session_participants (session_id, user_id, created_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id, user_id) DO NOTHING`,
  ).run(sessionId, userId, nowMs);
}

export function setPersonalMemoryConsent(
  db: Database,
  sessionId: string,
  userId: string,
  consentedAtMs = Date.now(),
): void {
  ensureSessionParticipant(db, sessionId, userId, consentedAtMs);
  db.prepare(
    `UPDATE session_participants
     SET personal_memory_consent_at_ms = ?
     WHERE session_id = ? AND user_id = ?`,
  ).run(consentedAtMs, sessionId, userId);
}

export function clearPersonalMemoryConsentForSession(db: Database, sessionId: string): string[] {
  const userIds = db
    .query<{ user_id: string }, [string]>(
      `SELECT user_id FROM session_participants
       WHERE session_id = ? AND personal_memory_consent_at_ms IS NOT NULL`,
    )
    .all(sessionId)
    .map((row) => row.user_id);

  if (userIds.length === 0) return [];

  db.prepare(
    `UPDATE session_participants
     SET personal_memory_consent_at_ms = NULL
     WHERE session_id = ?`,
  ).run(sessionId);

  return userIds;
}

export function clearPersonalMemoryConsentForParticipant(
  db: Database,
  sessionId: string,
  userId: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE session_participants
       SET personal_memory_consent_at_ms = NULL
       WHERE session_id = ? AND user_id = ? AND personal_memory_consent_at_ms IS NOT NULL`,
    )
    .run(sessionId, userId);
  return result.changes > 0;
}

export function hasPersonalMemoryConsent(db: Database, sessionId: string, userId: string): boolean {
  const row = db
    .query<{ personal_memory_consent_at_ms: number | null }, [string, string]>(
      `SELECT personal_memory_consent_at_ms
       FROM session_participants
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
    )
    .get(sessionId, userId);
  return row?.personal_memory_consent_at_ms != null;
}

export function countActivePersonalMemoryConsents(
  db: Database,
  orgId: string,
  userId: string,
): number {
  const row = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c
       FROM session_participants sp
       JOIN sessions s ON s.id = sp.session_id
       JOIN authz_grants og ON og.scope_type = 'team'
         AND og.scope_id = s.team_id
         AND og.resource_type = 'org'
         AND og.resource_id = ?
         AND og.feature = 'member'
         AND og.revoked_at_ms IS NULL
       WHERE sp.user_id = ?
         AND sp.personal_memory_consent_at_ms IS NOT NULL`,
    )
    .get(orgId, userId);
  return row?.c ?? 0;
}

export function resolveOrgIdForSession(db: Database, sessionId: string): string | null {
  const row = db
    .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  if (row === null) return null;
  return getOrgIdForTeam(db, row.team_id);
}
