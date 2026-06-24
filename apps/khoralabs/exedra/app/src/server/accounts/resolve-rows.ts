import type { Database } from "bun:sqlite";

import type {
  AccountProfile,
  AccountRow,
  OrgMemberContext,
  SessionParticipantContext,
  TeamMemberContext,
} from "@shared/accounts/row";

import {
  Feature,
  hasOrgAdminGrant,
  hasTeamAdminGrant,
  listAccountIdsForTeam,
  listGrantScopeIdsForResource,
  ResourceType,
  ScopeType,
} from "../authz/policy";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { listOrgMembers, listTeamMembers } from "../db/membership";
import { getInterviewStatus } from "../db/session-detail";
import { findUserById } from "../identity/users";

type UserProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  job_function: string | null;
  avatar_s3_key: string | null;
};

function mapProfile(row: UserProfileRow): AccountProfile {
  return {
    userId: row.id,
    email: row.email,
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
    email: user.email,
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
      `SELECT id, email, full_name, job_function, avatar_s3_key
       FROM users WHERE id IN (${placeholders})`,
    )
    .all(...userIds);

  const profiles = new Map<string, AccountProfile>();
  for (const row of rows) {
    profiles.set(row.id, mapProfile(row));
  }
  return profiles;
}

async function listSessionParticipantRoles(
  sessionId: string,
): Promise<Map<string, "facilitator" | "facilitation" | "participant">> {
  const roles = new Map<string, "facilitator" | "facilitation" | "participant">();
  const sessionResource = { type: ResourceType.Session, id: sessionId };

  for (const feature of [Feature.Admin, Feature.Facilitation, Feature.Participant] as const) {
    const role =
      feature === Feature.Admin
        ? "facilitator"
        : feature === Feature.Facilitation
          ? "facilitation"
          : "participant";

    for (const accountId of await listGrantScopeIdsForResource(
      sessionResource,
      feature,
      ScopeType.Account,
    )) {
      const existing = roles.get(accountId);
      if (existing === "facilitator") continue;
      if (existing === "facilitation" && role === "participant") continue;
      if (existing === "participant" && role === "facilitation") {
        roles.set(accountId, "facilitation");
        continue;
      }
      roles.set(accountId, role);
    }

    for (const teamId of await listGrantScopeIdsForResource(
      sessionResource,
      feature,
      ScopeType.Team,
    )) {
      for (const accountId of await listAccountIdsForTeam(teamId, Feature.Member)) {
        const existing = roles.get(accountId);
        if (existing === "facilitator") continue;
        if (existing === "facilitation" && role === "participant") continue;
        if (existing === "participant" && role === "facilitation") {
          roles.set(accountId, "facilitation");
          continue;
        }
        if (existing === undefined || role === "facilitator") {
          roles.set(accountId, role);
        }
      }
    }
  }

  return roles;
}

export async function listAccountRowsForSession(
  db: Database,
  sessionId: string,
  viewerId: string,
): Promise<AccountRow<SessionParticipantContext>[]> {
  const participantRoles = await listSessionParticipantRoles(sessionId);
  if (participantRoles.size === 0) return [];

  const profiles = resolveAccountProfiles(db, [...participantRoles.keys()]);
  const rows: AccountRow<SessionParticipantContext>[] = [];

  for (const [userId, role] of participantRoles) {
    const account = profiles.get(userId);
    if (account === undefined) continue;
    rows.push({
      account,
      isCurrentUser: userId === viewerId,
      context: {
        kind: "session_participant",
        sessionId,
        role,
        interviewStatus: getInterviewStatus(db, sessionId, userId),
      },
    });
  }

  rows.sort((a, b) => {
    const roleOrder = { facilitator: 0, facilitation: 1, participant: 2 } as const;
    if (a.context.role !== b.context.role) {
      return roleOrder[a.context.role] - roleOrder[b.context.role];
    }
    return (a.account.email ?? "").localeCompare(b.account.email ?? "");
  });

  return rows;
}

export async function listAccountRowsForTeam(
  db: Database,
  teamId: string,
  viewerId: string,
): Promise<AccountRow<TeamMemberContext>[]> {
  const members = await listTeamMembers(db, teamId);
  if (members.length === 0) return [];

  const profiles = resolveAccountProfiles(
    db,
    members.map((member) => member.userId),
  );

  const rows: AccountRow<TeamMemberContext>[] = [];
  for (const member of members) {
    const account = profiles.get(member.userId);
    if (account === undefined) continue;
    rows.push({
      account,
      isCurrentUser: member.userId === viewerId,
      context: {
        kind: "team_member",
        teamId,
        isAdmin: await hasTeamAdminGrant(member.userId, teamId),
      },
    });
  }
  return rows;
}

export async function listAccountRowsForOrg(
  db: Database,
  orgId: string,
  viewerId: string,
): Promise<AccountRow<OrgMemberContext>[]> {
  const members = await listOrgMembers(db, orgId);
  if (members.length === 0) return [];

  const profiles = resolveAccountProfiles(
    db,
    members.map((member) => member.userId),
  );

  const rows: AccountRow<OrgMemberContext>[] = [];
  for (const member of members) {
    const account = profiles.get(member.userId);
    if (account === undefined) continue;
    rows.push({
      account,
      isCurrentUser: member.userId === viewerId,
      context: {
        kind: "org_member",
        orgId,
        isAdmin: await hasOrgAdminGrant(member.userId, orgId),
        teamIds: member.teamIds,
        teamNames: member.teamNames,
      },
    });
  }
  return rows;
}
