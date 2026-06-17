import type { Database } from "bun:sqlite";

export type OrgRecord = {
  id: string;
  name: string;
  ownerId: string;
  avatarS3Key: string | null;
  createdAtMs: number;
};

export type TeamRecord = {
  id: string;
  orgId: string;
  name: string;
  ownerId: string;
  avatarS3Key: string | null;
  createdAtMs: number;
};

export type UserTeamRecord = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  teamAvatarS3Key: string | null;
  orgAvatarS3Key: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  owner_id: string;
  avatar_s3_key: string | null;
  created_at_ms: number;
};

type TeamRow = {
  id: string;
  org_id: string;
  name: string;
  owner_id: string;
  avatar_s3_key: string | null;
  created_at_ms: number;
};

type UserTeamRow = {
  id: string;
  name: string;
  org_id: string;
  org_name: string;
  team_avatar_s3_key: string | null;
  org_avatar_s3_key: string | null;
};

function mapOrg(row: OrgRow): OrgRecord {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
  };
}

function mapTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    ownerId: row.owner_id,
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
  };
}

export function getOrg(db: Database, orgId: string): OrgRecord | null {
  const row = db
    .query<OrgRow, [string]>(
      `SELECT id, name, owner_id, avatar_s3_key, created_at_ms FROM orgs WHERE id = ?`,
    )
    .get(orgId);
  if (row === null) return null;
  return mapOrg(row);
}

export function getTeam(db: Database, teamId: string): TeamRecord | null {
  const row = db
    .query<TeamRow, [string]>(
      `SELECT id, org_id, name, owner_id, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`,
    )
    .get(teamId);
  if (row === null) return null;
  return mapTeam(row);
}

export function updateOrgName(db: Database, orgId: string, name: string): OrgRecord | null {
  db.prepare(`UPDATE orgs SET name = ? WHERE id = ?`).run(name, orgId);
  return getOrg(db, orgId);
}

export function updateTeamName(db: Database, teamId: string, name: string): TeamRecord | null {
  db.prepare(`UPDATE teams SET name = ? WHERE id = ?`).run(name, teamId);
  return getTeam(db, teamId);
}

export function updateOrgAvatarS3Key(
  db: Database,
  orgId: string,
  avatarS3Key: string | null,
): OrgRecord | null {
  db.prepare(`UPDATE orgs SET avatar_s3_key = ? WHERE id = ?`).run(avatarS3Key, orgId);
  return getOrg(db, orgId);
}

export function updateTeamAvatarS3Key(
  db: Database,
  teamId: string,
  avatarS3Key: string | null,
): TeamRecord | null {
  db.prepare(`UPDATE teams SET avatar_s3_key = ? WHERE id = ?`).run(avatarS3Key, teamId);
  return getTeam(db, teamId);
}

export function listTeamsForUser(db: Database, userId: string): UserTeamRecord[] {
  const rows = db
    .query<UserTeamRow, [string]>(
      `SELECT t.id, t.name, t.org_id, o.name AS org_name,
              t.avatar_s3_key AS team_avatar_s3_key, o.avatar_s3_key AS org_avatar_s3_key
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
    teamAvatarS3Key: row.team_avatar_s3_key,
    orgAvatarS3Key: row.org_avatar_s3_key,
  }));
}

export type TeamMemberRecord = {
  userId: string;
  registryUserId: string;
};

type TeamMemberRow = {
  user_id: string;
  registry_user_id: string;
};

export function listTeamMembers(db: Database, teamId: string): TeamMemberRecord[] {
  const rows = db
    .query<TeamMemberRow, [string]>(
      `SELECT u.id AS user_id, u.registry_user_id
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ?
       ORDER BY tm.created_at_ms ASC`,
    )
    .all(teamId);
  return rows.map((row) => ({
    userId: row.user_id,
    registryUserId: row.registry_user_id,
  }));
}

export function userHasAnyTeam(db: Database, userId: string): boolean {
  const row = db
    .query<{ c: number }, [string]>(`SELECT COUNT(1) AS c FROM team_members WHERE user_id = ?`)
    .get(userId);
  return row !== null && row.c > 0;
}

export function userBelongsToOrg(db: Database, orgId: string, userId: string): boolean {
  const row = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE t.org_id = ? AND tm.user_id = ?`,
    )
    .get(orgId, userId);
  return row !== null && row.c > 0;
}

/** Undo a failed team creation (membership + team only). */
export function rollbackTeamCreation(db: Database, teamId: string): void {
  db.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(teamId);
  db.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId);
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

export type PendingOnboardingInterview = {
  teamId: string;
  sessionId: string;
};

export function getPendingOnboardingInterview(
  db: Database,
  userId: string,
): PendingOnboardingInterview | null {
  const row = db
    .query<{ team_id: string; onboarding_session_id: string }, [string]>(
      `SELECT tm.team_id, tm.onboarding_session_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ?
         AND tm.onboarding_interview_complete = 0
         AND tm.onboarding_session_id IS NOT NULL
       ORDER BY t.created_at_ms ASC
       LIMIT 1`,
    )
    .get(userId);
  if (row === null || row.onboarding_session_id.length === 0) return null;
  return { teamId: row.team_id, sessionId: row.onboarding_session_id };
}

export function userNeedsOnboardingInterview(db: Database, userId: string): boolean {
  return getPendingOnboardingInterview(db, userId) !== null;
}

export function userNeedsOnboardingInterviewForTeam(
  db: Database,
  teamId: string,
  userId: string,
): boolean {
  const row = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c
       FROM team_members
       WHERE team_id = ? AND user_id = ?
         AND onboarding_interview_complete = 0
         AND onboarding_session_id IS NOT NULL`,
    )
    .get(teamId, userId);
  return row !== null && row.c > 0;
}

export function setTeamMemberOnboardingSession(
  db: Database,
  params: { teamId: string; userId: string; sessionId: string },
): void {
  db.prepare(
    `UPDATE team_members
     SET onboarding_session_id = ?, onboarding_interview_complete = 0
     WHERE team_id = ? AND user_id = ?`,
  ).run(params.sessionId, params.teamId, params.userId);
}

export function completeTeamMemberOnboardingInterview(
  db: Database,
  params: { teamId: string; userId: string },
): void {
  db.prepare(
    `UPDATE team_members
     SET onboarding_interview_complete = 1
     WHERE team_id = ? AND user_id = ?`,
  ).run(params.teamId, params.userId);
}
