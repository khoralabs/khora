import type { Database } from "bun:sqlite";

export type OrgRecord = {
  id: string;
  name: string;
  ownerId: string;
  createdAtMs: number;
};

export type TeamRecord = {
  id: string;
  orgId: string;
  name: string;
  ownerId: string;
  createdAtMs: number;
};

export type UserTeamRecord = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
};

type OrgRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at_ms: number;
};

type TeamRow = {
  id: string;
  org_id: string;
  name: string;
  owner_id: string;
  created_at_ms: number;
};

type UserTeamRow = {
  id: string;
  name: string;
  org_id: string;
  org_name: string;
};

export function getOrg(db: Database, orgId: string): OrgRecord | null {
  const row = db
    .query<OrgRow, [string]>(`SELECT id, name, owner_id, created_at_ms FROM orgs WHERE id = ?`)
    .get(orgId);
  if (row === null) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAtMs: row.created_at_ms,
  };
}

export function getTeam(db: Database, teamId: string): TeamRecord | null {
  const row = db
    .query<TeamRow, [string]>(
      `SELECT id, org_id, name, owner_id, created_at_ms FROM teams WHERE id = ?`,
    )
    .get(teamId);
  if (row === null) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    ownerId: row.owner_id,
    createdAtMs: row.created_at_ms,
  };
}

export function listTeamsForUser(db: Database, userId: string): UserTeamRecord[] {
  const rows = db
    .query<UserTeamRow, [string]>(
      `SELECT t.id, t.name, t.org_id, o.name AS org_name
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       JOIN orgs o ON o.id = t.org_id
       WHERE tm.user_id = ?
       ORDER BY t.created_at_ms ASC`,
    )
    .all(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    orgId: row.org_id,
    orgName: row.org_name,
  }));
}

export function userHasAnyTeam(db: Database, userId: string): boolean {
  const row = db
    .query<{ c: number }, [string]>(`SELECT COUNT(1) AS c FROM team_members WHERE user_id = ?`)
    .get(userId);
  return row !== null && row.c > 0;
}

/** Undo a failed onboarding attempt (org + team + membership only). */
export function rollbackOnboarding(db: Database, params: { orgId: string; teamId: string }): void {
  db.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(params.teamId);
  db.prepare(`DELETE FROM teams WHERE id = ?`).run(params.teamId);
  db.prepare(`DELETE FROM orgs WHERE id = ?`).run(params.orgId);
}

export function addTeamMember(db: Database, teamId: string, userId: string): void {
  const existing = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c FROM team_members WHERE team_id = ? AND user_id = ?`,
    )
    .get(teamId, userId);
  if (existing !== null && existing.c > 0) return;

  db.prepare(`INSERT INTO team_members (team_id, user_id, created_at_ms) VALUES (?, ?, ?)`).run(
    teamId,
    userId,
    Date.now(),
  );
}
