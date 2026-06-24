import type { Database } from "bun:sqlite";

import { getOrgIdForTeam } from "../authz/policy";

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

export async function countActivePersonalMemoryConsents(
  db: Database,
  orgId: string,
  userId: string,
): Promise<number> {
  const rows = db
    .query<{ session_id: string }, [string]>(
      `SELECT session_id FROM session_participants
       WHERE user_id = ? AND personal_memory_consent_at_ms IS NOT NULL`,
    )
    .all(userId);

  let count = 0;
  for (const row of rows) {
    const resolvedOrgId = await resolveOrgIdForSession(db, row.session_id);
    if (resolvedOrgId === orgId) count += 1;
  }
  return count;
}

export async function resolveOrgIdForSession(
  db: Database,
  sessionId: string,
): Promise<string | null> {
  const row = db
    .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  if (row === null) return null;
  return getOrgIdForTeam(row.team_id);
}
