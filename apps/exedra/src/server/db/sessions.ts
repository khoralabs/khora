import type { Database } from "bun:sqlite";

export type SessionRecord = {
  id: string;
  teamId: string;
  displayName: string;
  topic: string;
  prompt: string;
  deadlineMs: number | null;
  facilitatorId: string;
  status: string;
  createdAtMs: number;
};

type SessionRow = {
  id: string;
  team_id: string;
  display_name: string;
  topic: string;
  prompt: string;
  deadline_ms: number | null;
  facilitator_id: string;
  status: string;
  created_at_ms: number;
};

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    displayName: row.display_name,
    topic: row.topic,
    prompt: row.prompt,
    deadlineMs: row.deadline_ms,
    facilitatorId: row.facilitator_id,
    status: row.status,
    createdAtMs: row.created_at_ms,
  };
}

export function createOrg(db: Database, params: { name: string; ownerId: string }): string {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO orgs (id, name, owner_id, created_at_ms) VALUES (?, ?, ?, ?)`).run(
    id,
    params.name,
    params.ownerId,
    Date.now(),
  );
  return id;
}

export function createTeam(
  db: Database,
  params: { orgId: string; name: string; ownerId: string },
): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO teams (id, org_id, name, owner_id, created_at_ms) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, params.orgId, params.name, params.ownerId, now);
  db.prepare(`INSERT INTO team_members (team_id, user_id, created_at_ms) VALUES (?, ?, ?)`).run(
    id,
    params.ownerId,
    now,
  );
  return id;
}

export function isTeamMember(db: Database, teamId: string, userId: string): boolean {
  const row = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c FROM team_members WHERE team_id = ? AND user_id = ?`,
    )
    .get(teamId, userId);
  return row !== null && row.c > 0;
}

export function createSession(
  db: Database,
  params: {
    teamId: string;
    displayName: string;
    topic: string;
    prompt: string;
    facilitatorId: string;
    deadlineMs?: number;
  },
): SessionRecord {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (
       id, team_id, display_name, topic, prompt, deadline_ms, facilitator_id, status, created_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    params.teamId,
    params.displayName,
    params.topic,
    params.prompt,
    params.deadlineMs ?? null,
    params.facilitatorId,
    now,
  );
  const row = db.query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`).get(id);
  if (row === null) throw new Error("session insert failed");
  return mapSession(row);
}

export function getSession(db: Database, sessionId: string): SessionRecord | null {
  const row = db
    .query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  return row === null ? null : mapSession(row);
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
  return id;
}

export function getThread(db: Database, threadId: string) {
  return db
    .query<{ id: string; kind: string; session_id: string; user_id: string | null }, [string]>(
      `SELECT id, kind, session_id, user_id FROM threads WHERE id = ? LIMIT 1`,
    )
    .get(threadId);
}
