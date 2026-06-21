import type { Database } from "bun:sqlite";
import {
  ACTIVE_GRANT_SQL,
  getOrgIdForTeam,
  hasGrant,
  listAccountIdsForTeam,
  listTeamIdsForOrg,
  revokeAllGrantsForTeamScope,
  revokeAllGrantsReferencingOrg,
  revokeAllGrantsReferencingTeam,
  userHasAnyTeamMemberGrant,
} from "../authz";
import { grantAllOrgPermissions, grantAllTeamPermissions } from "../authz/grant-templates";
import {
  accountScope,
  Feature,
  grantTeamMember,
  grantTeamOrgMembership,
  ResourceType,
} from "../authz/policy";
import { provisionOrgIdentity } from "../identity/orgs";

export type OrgRecord = {
  id: string;
  name: string;
  avatarS3Key: string | null;
  createdAtMs: number;
  networkOptedInAtMs: number | null;
};

export type TeamRecord = {
  id: string;
  orgId: string;
  name: string;
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
  avatar_s3_key: string | null;
  created_at_ms: number;
  network_opted_in_at_ms: number | null;
};

type TeamRow = {
  id: string;
  name: string;
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
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
    networkOptedInAtMs: row.network_opted_in_at_ms,
  };
}

export function getOrg(db: Database, orgId: string): OrgRecord | null {
  const row = db
    .query<OrgRow, [string]>(
      `SELECT id, name, avatar_s3_key, created_at_ms, network_opted_in_at_ms FROM orgs WHERE id = ?`,
    )
    .get(orgId);
  if (row === null) return null;
  return mapOrg(row);
}

export function getTeam(db: Database, teamId: string): TeamRecord | null {
  const row = db
    .query<TeamRow, [string]>(
      `SELECT id, name, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`,
    )
    .get(teamId);
  if (row === null) return null;

  const orgId = getOrgIdForTeam(db, teamId);
  if (orgId === null) return null;

  return {
    id: row.id,
    orgId,
    name: row.name,
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
  };
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
  const nowMs = Date.now();
  const rows = db
    .query<UserTeamRow, [string, number]>(
      `SELECT t.id, t.name, g_org.resource_id AS org_id, o.name AS org_name,
              t.avatar_s3_key AS team_avatar_s3_key, o.avatar_s3_key AS org_avatar_s3_key
       FROM authz_grants g_team
       JOIN teams t ON t.id = g_team.resource_id
       JOIN authz_grants g_org ON g_org.scope_type = 'team' AND g_org.scope_id = t.id
         AND g_org.resource_type = 'org' AND g_org.feature = 'member'
         AND g_org.revoked_at_ms IS NULL
         AND (g_org.expired_at_ms IS NULL OR g_org.expired_at_ms > ?2)
       JOIN orgs o ON o.id = g_org.resource_id
       WHERE g_team.scope_type = 'account' AND g_team.scope_id = ?1
         AND g_team.resource_type = 'team' AND g_team.feature = 'member'
         AND g_team.revoked_at_ms IS NULL
         AND (g_team.expired_at_ms IS NULL OR g_team.expired_at_ms > ?2)
       ORDER BY t.created_at_ms ASC`,
    )
    .all(userId, nowMs);
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
  fullName: string | null;
};

export type OrgMemberRecord = {
  userId: string;
  fullName: string | null;
  teamIds: string[];
  teamNames: string[];
};

export type OrgTeamRecord = {
  id: string;
  name: string;
  avatarS3Key: string | null;
  memberCount: number;
  createdAtMs: number;
};

type TeamMemberRow = {
  user_id: string;
  full_name: string | null;
};

type OrgMemberRow = {
  user_id: string;
  full_name: string | null;
  team_ids: string;
  team_names: string;
};

export function listTeamMembers(db: Database, teamId: string): TeamMemberRecord[] {
  const accountIds = listAccountIdsForTeam(db, teamId);
  if (accountIds.length === 0) return [];

  const placeholders = accountIds.map(() => "?").join(", ");
  const rows = db
    .query<TeamMemberRow, string[]>(
      `SELECT u.id AS user_id, u.full_name
       FROM users u
       WHERE u.id IN (${placeholders})
       ORDER BY u.created_at_ms ASC`,
    )
    .all(...accountIds);
  return rows.map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
  }));
}

export function listOrgMembers(db: Database, orgId: string): OrgMemberRecord[] {
  const teamIds = listTeamIdsForOrg(db, orgId);
  if (teamIds.length === 0) return [];

  const nowMs = Date.now();
  const teamPlaceholders = teamIds.map(() => "?").join(", ");
  const rows = db
    .query<OrgMemberRow, [...string[], number]>(
      `SELECT u.id AS user_id, u.full_name,
              GROUP_CONCAT(t.id) AS team_ids,
              GROUP_CONCAT(t.name) AS team_names
       FROM authz_grants g
       JOIN teams t ON t.id = g.resource_id
       JOIN users u ON u.id = g.scope_id
       WHERE g.scope_type = 'account'
         AND g.resource_type = 'team'
         AND g.feature = 'member'
         AND g.resource_id IN (${teamPlaceholders})
         AND ${ACTIVE_GRANT_SQL}
       GROUP BY u.id
       ORDER BY MIN(g.created_at_ms) ASC`,
    )
    .all(...teamIds, nowMs);

  return rows.map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    teamIds: row.team_ids.length > 0 ? row.team_ids.split(",") : [],
    teamNames: row.team_names.length > 0 ? row.team_names.split(",") : [],
  }));
}

export function listTeamsForOrg(db: Database, orgId: string): OrgTeamRecord[] {
  const teamIds = listTeamIdsForOrg(db, orgId);
  if (teamIds.length === 0) return [];

  const nowMs = Date.now();
  return teamIds
    .map((teamId) => {
      const row = db
        .query<
          { id: string; name: string; avatar_s3_key: string | null; created_at_ms: number },
          [string]
        >(`SELECT id, name, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`)
        .get(teamId);
      if (row === null) return null;
      const memberCount = listAccountIdsForTeam(db, teamId, "member", nowMs).length;
      return {
        id: row.id,
        name: row.name,
        avatarS3Key: row.avatar_s3_key,
        memberCount,
        createdAtMs: row.created_at_ms,
      };
    })
    .filter((row): row is OrgTeamRecord => row !== null)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export function userHasAnyTeam(db: Database, userId: string): boolean {
  return userHasAnyTeamMemberGrant(db, userId);
}

export { userBelongsToOrg } from "../authz/policy";

export function isTeamMember(db: Database, teamId: string, userId: string): boolean {
  return hasGrant(
    db,
    accountScope(userId),
    { type: ResourceType.Team, id: teamId },
    Feature.Member,
  );
}

/** Undo a failed team creation (grants + team + onboarding). */
export function rollbackTeamCreation(db: Database, teamId: string): void {
  revokeAllGrantsForTeamScope(db, teamId);
  revokeAllGrantsReferencingTeam(db, teamId);
  db.prepare(`DELETE FROM team_account_onboarding WHERE team_id = ?`).run(teamId);
  db.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId);
}

/** Undo a failed onboarding attempt (org + team + grants). */
export function rollbackOnboarding(db: Database, params: { orgId: string; teamId: string }): void {
  rollbackTeamCreation(db, params.teamId);
  revokeAllGrantsReferencingOrg(db, params.orgId);
  db.prepare(`DELETE FROM orgs WHERE id = ?`).run(params.orgId);
}

export function addTeamMember(db: Database, teamId: string, userId: string): void {
  grantTeamMember(db, userId, teamId);
}

export async function createOrgWithAdmin(
  db: Database,
  params: { name: string; creatorId: string },
): Promise<string> {
  const { did, identityEncrypted } = await provisionOrgIdentity();
  const now = Date.now();
  db.prepare(
    `INSERT INTO orgs (id, name, identity_encrypted, created_at_ms) VALUES (?, ?, ?, ?)`,
  ).run(did, params.name, identityEncrypted, now);
  grantAllOrgPermissions(db, params.creatorId, did);
  return did;
}

export function createTeamWithGrants(
  db: Database,
  params: { orgId: string; name: string; creatorId: string },
): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO teams (id, name, created_at_ms) VALUES (?, ?, ?)`).run(
    id,
    params.name,
    now,
  );
  grantTeamOrgMembership(db, id, params.orgId);
  grantAllTeamPermissions(db, params.creatorId, id);
  return id;
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
      `SELECT o.team_id, o.onboarding_session_id
       FROM team_account_onboarding o
       JOIN teams t ON t.id = o.team_id
       WHERE o.account_id = ?
         AND o.onboarding_interview_complete = 0
         AND o.onboarding_session_id IS NOT NULL
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
       FROM team_account_onboarding
       WHERE team_id = ? AND account_id = ?
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
  const now = Date.now();
  db.prepare(
    `INSERT INTO team_account_onboarding (team_id, account_id, onboarding_session_id, onboarding_interview_complete, created_at_ms)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(team_id, account_id) DO UPDATE SET
       onboarding_session_id = excluded.onboarding_session_id,
       onboarding_interview_complete = 0`,
  ).run(params.teamId, params.userId, params.sessionId, now);
}

export function completeTeamMemberOnboardingInterview(
  db: Database,
  params: { teamId: string; userId: string },
): void {
  db.prepare(
    `UPDATE team_account_onboarding
     SET onboarding_interview_complete = 1
     WHERE team_id = ? AND account_id = ?`,
  ).run(params.teamId, params.userId);
}
