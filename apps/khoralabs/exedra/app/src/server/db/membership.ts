import type { Database } from "bun:sqlite";
import { OrgPermission, TeamPermission } from "../../shared/authz/permissions";
import {
  getOrgIdForTeam,
  grantTeamMember,
  grantTeamOrgMembership,
  hasGrant,
  listAccountIdsForTeam,
  listTeamIdsForOrg,
  revokeAllGrantsForTeamScope,
  revokeAllGrantsReferencingOrg,
  revokeAllGrantsReferencingTeam,
  userBelongsToOrg,
  userHasAnyTeamMemberGrant,
} from "../authz";
import { ensureOrgAgentRepresents } from "../authz/facts";
import {
  grantAllOrgPermissions,
  grantAllTeamPermissions,
  grantTeamScopeOrgPermission,
  grantTeamScopePermission,
} from "../authz/grant-templates";
import { accountScope, Feature, ResourceType } from "../authz/policy";
import { requireAuthzServiceClient } from "../authz/service-client";
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

export async function getTeam(db: Database, teamId: string): Promise<TeamRecord | null> {
  const row = db
    .query<TeamRow, [string]>(
      `SELECT id, name, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`,
    )
    .get(teamId);
  if (row === null) return null;

  const orgId = await getOrgIdForTeam(teamId);
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

export async function updateTeamName(
  db: Database,
  teamId: string,
  name: string,
): Promise<TeamRecord | null> {
  db.prepare(`UPDATE teams SET name = ? WHERE id = ?`).run(name, teamId);
  return await getTeam(db, teamId);
}

export function updateOrgAvatarS3Key(
  db: Database,
  orgId: string,
  avatarS3Key: string | null,
): OrgRecord | null {
  db.prepare(`UPDATE orgs SET avatar_s3_key = ? WHERE id = ?`).run(avatarS3Key, orgId);
  return getOrg(db, orgId);
}

export async function updateTeamAvatarS3Key(
  db: Database,
  teamId: string,
  avatarS3Key: string | null,
): Promise<TeamRecord | null> {
  db.prepare(`UPDATE teams SET avatar_s3_key = ? WHERE id = ?`).run(avatarS3Key, teamId);
  return await getTeam(db, teamId);
}

export async function listTeamsForUser(db: Database, userId: string): Promise<UserTeamRecord[]> {
  const { teamIds } = await requireAuthzServiceClient().listTeamIdsForAccount({
    accountId: userId,
  });
  const rows: UserTeamRecord[] = [];
  for (const teamId of teamIds) {
    const teamRow = db
      .query<TeamRow & { created_at_ms: number }, [string]>(
        `SELECT id, name, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`,
      )
      .get(teamId);
    if (teamRow === null) continue;
    const orgId = await getOrgIdForTeam(teamId);
    if (orgId === null) continue;
    const orgRow = db
      .query<{ name: string; avatar_s3_key: string | null }, [string]>(
        `SELECT name, avatar_s3_key FROM orgs WHERE id = ?`,
      )
      .get(orgId);
    if (orgRow === null) continue;
    rows.push({
      id: teamRow.id,
      name: teamRow.name,
      orgId,
      orgName: orgRow.name,
      teamAvatarS3Key: teamRow.avatar_s3_key,
      orgAvatarS3Key: orgRow.avatar_s3_key,
    });
  }
  return rows.sort((a, b) => {
    const aCreated =
      db
        .query<{ created_at_ms: number }, [string]>(`SELECT created_at_ms FROM teams WHERE id = ?`)
        .get(a.id)?.created_at_ms ?? 0;
    const bCreated =
      db
        .query<{ created_at_ms: number }, [string]>(`SELECT created_at_ms FROM teams WHERE id = ?`)
        .get(b.id)?.created_at_ms ?? 0;
    return aCreated - bCreated;
  });
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

export async function listTeamMembers(db: Database, teamId: string): Promise<TeamMemberRecord[]> {
  const accountIds = await listAccountIdsForTeam(teamId);
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

export async function listOrgMembers(db: Database, orgId: string): Promise<OrgMemberRecord[]> {
  const teamIds = await listTeamIdsForOrg(orgId);
  if (teamIds.length === 0) return [];

  const memberMap = new Map<string, { teamIds: string[]; teamNames: string[] }>();
  for (const teamId of teamIds) {
    const teamRow = db
      .query<{ name: string }, [string]>(`SELECT name FROM teams WHERE id = ?`)
      .get(teamId);
    if (teamRow === null) continue;
    for (const accountId of await listAccountIdsForTeam(teamId)) {
      const existing = memberMap.get(accountId) ?? { teamIds: [], teamNames: [] };
      existing.teamIds.push(teamId);
      existing.teamNames.push(teamRow.name);
      memberMap.set(accountId, existing);
    }
  }

  if (memberMap.size === 0) return [];
  const accountIds = [...memberMap.keys()];
  const placeholders = accountIds.map(() => "?").join(", ");
  const rows = db
    .query<TeamMemberRow, string[]>(
      `SELECT u.id AS user_id, u.full_name
       FROM users u
       WHERE u.id IN (${placeholders})
       ORDER BY u.created_at_ms ASC`,
    )
    .all(...accountIds);

  return rows.flatMap((row) => {
    const membership = memberMap.get(row.user_id);
    if (membership === undefined) return [];
    return [
      {
        userId: row.user_id,
        fullName: row.full_name,
        teamIds: membership.teamIds,
        teamNames: membership.teamNames,
      },
    ];
  });
}

export async function listTeamsForOrg(db: Database, orgId: string): Promise<OrgTeamRecord[]> {
  const teamIds = await listTeamIdsForOrg(orgId);
  if (teamIds.length === 0) return [];

  const teams: OrgTeamRecord[] = [];
  for (const teamId of teamIds) {
    const row = db
      .query<
        { id: string; name: string; avatar_s3_key: string | null; created_at_ms: number },
        [string]
      >(`SELECT id, name, avatar_s3_key, created_at_ms FROM teams WHERE id = ?`)
      .get(teamId);
    if (row === null) continue;
    const memberCount = (await listAccountIdsForTeam(teamId, Feature.Member)).length;
    teams.push({
      id: row.id,
      name: row.name,
      avatarS3Key: row.avatar_s3_key,
      memberCount,
      createdAtMs: row.created_at_ms,
    });
  }
  return teams.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export async function userHasAnyTeam(_db: Database, userId: string): Promise<boolean> {
  return userHasAnyTeamMemberGrant(userId);
}

export { userBelongsToOrg };

export async function isTeamMember(
  _db: Database,
  teamId: string,
  userId: string,
): Promise<boolean> {
  return hasGrant(accountScope(userId), { type: ResourceType.Team, id: teamId }, Feature.Member);
}

export async function rollbackTeamCreation(db: Database, teamId: string): Promise<void> {
  await revokeAllGrantsForTeamScope(teamId);
  await revokeAllGrantsReferencingTeam(teamId);
  db.prepare(`DELETE FROM team_account_onboarding WHERE team_id = ?`).run(teamId);
  db.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId);
}

export async function rollbackOnboarding(
  db: Database,
  params: { orgId: string; teamId: string },
): Promise<void> {
  await rollbackTeamCreation(db, params.teamId);
  await revokeAllGrantsReferencingOrg(params.orgId);
  db.prepare(`DELETE FROM orgs WHERE id = ?`).run(params.orgId);
}

export async function addTeamMember(_db: Database, teamId: string, userId: string): Promise<void> {
  await grantTeamMember(userId, teamId);
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
  await grantAllOrgPermissions(params.creatorId, did);
  await ensureOrgAgentRepresents(did);
  return did;
}

export async function createTeamWithGrants(
  db: Database,
  params: { orgId: string; name: string; creatorId: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO teams (id, name, created_at_ms) VALUES (?, ?, ?)`).run(
    id,
    params.name,
    now,
  );
  await grantTeamOrgMembership(id, params.orgId);
  await grantTeamScopePermission(id, TeamPermission.SessionCreate);
  await grantTeamScopeOrgPermission(id, params.orgId, OrgPermission.SessionCreate);
  await grantAllTeamPermissions(params.creatorId, id);
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
