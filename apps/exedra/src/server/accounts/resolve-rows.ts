import type { Database } from "bun:sqlite";

import type {
  AccountProfile,
  AccountRow,
  OrgMemberContext,
  SessionParticipantContext,
  TeamMemberContext,
} from "@shared/accounts/row";

import { ACTIVE_GRANT_SQL } from "../authz/active";
import { listAccountIdsForTeam } from "../authz/grants";
import { Feature, hasOrgAdminGrant, hasTeamAdminGrant, ResourceType } from "../authz/policy";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { listOrgMembers, listTeamMembers } from "../db/membership";
import { getInterviewStatus } from "../db/session-detail";
import { findUserById } from "../identity/users";

type UserProfileRow = {
  id: string;
  registry_user_id: string;
  full_name: string | null;
  job_function: string | null;
  avatar_s3_key: string | null;
};

function mapProfile(row: UserProfileRow): AccountProfile {
  return {
    userId: row.id,
    registryUserId: row.registry_user_id,
    fullName: row.full_name,
    avatarUrl: avatarUrlFromS3Key("user", row.id, row.avatar_s3_key),
    jobFunction: row.job_function,
  };
}

export function resolveAccountProfile(db: Database, userId: string): AccountProfile | null {
  const user = findUserById(db, userId);
  if (user === null) return null;
  return {
    userId: user.id,
    registryUserId: user.registryUserId,
    fullName: user.fullName,
    avatarUrl: avatarUrlFromS3Key("user", user.id, user.avatarS3Key),
    jobFunction: user.jobFunction,
  };
}

export function resolveAccountProfiles(
  db: Database,
  userIds: readonly string[],
): Map<string, AccountProfile> {
  if (userIds.length === 0) return new Map();

  const placeholders = userIds.map(() => "?").join(", ");
  const rows = db
    .query<UserProfileRow, string[]>(
      `SELECT id, registry_user_id, full_name, job_function, avatar_s3_key
       FROM users WHERE id IN (${placeholders})`,
    )
    .all(...userIds);

  const profiles = new Map<string, AccountProfile>();
  for (const row of rows) {
    profiles.set(row.id, mapProfile(row));
  }
  return profiles;
}

function listSessionParticipantRoles(db: Database, sessionId: string): Map<string, boolean> {
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

export function listAccountRowsForSession(
  db: Database,
  sessionId: string,
  viewerId: string,
): AccountRow<SessionParticipantContext>[] {
  const participantRoles = listSessionParticipantRoles(db, sessionId);
  if (participantRoles.size === 0) return [];

  const profiles = resolveAccountProfiles(db, [...participantRoles.keys()]);
  const rows: AccountRow<SessionParticipantContext>[] = [];

  for (const [userId, isFacilitator] of participantRoles) {
    const account = profiles.get(userId);
    if (account === undefined) continue;
    rows.push({
      account,
      isCurrentUser: userId === viewerId,
      context: {
        kind: "session_participant",
        sessionId,
        role: isFacilitator ? "facilitator" : "participant",
        interviewStatus: getInterviewStatus(db, sessionId, userId),
      },
    });
  }

  rows.sort((a, b) => {
    if (a.context.role !== b.context.role) {
      return a.context.role === "facilitator" ? -1 : 1;
    }
    return a.account.registryUserId.localeCompare(b.account.registryUserId);
  });

  return rows;
}

export function listAccountRowsForTeam(
  db: Database,
  teamId: string,
  viewerId: string,
): AccountRow<TeamMemberContext>[] {
  const members = listTeamMembers(db, teamId);
  if (members.length === 0) return [];

  const profiles = resolveAccountProfiles(
    db,
    members.map((member) => member.userId),
  );

  return members.flatMap((member) => {
    const account = profiles.get(member.userId);
    if (account === undefined) return [];
    return [
      {
        account,
        isCurrentUser: member.userId === viewerId,
        context: {
          kind: "team_member" as const,
          teamId,
          isAdmin: hasTeamAdminGrant(db, member.userId, teamId),
        },
      },
    ];
  });
}

export function listAccountRowsForOrg(
  db: Database,
  orgId: string,
  viewerId: string,
): AccountRow<OrgMemberContext>[] {
  const members = listOrgMembers(db, orgId);
  if (members.length === 0) return [];

  const profiles = resolveAccountProfiles(
    db,
    members.map((member) => member.userId),
  );

  return members.flatMap((member) => {
    const account = profiles.get(member.userId);
    if (account === undefined) return [];
    return [
      {
        account,
        isCurrentUser: member.userId === viewerId,
        context: {
          kind: "org_member" as const,
          orgId,
          isAdmin: hasOrgAdminGrant(db, member.userId, orgId),
          teamIds: member.teamIds,
          teamNames: member.teamNames,
        },
      },
    ];
  });
}
