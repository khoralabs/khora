import type { Database } from "bun:sqlite";

import type { OrgTeamContext, TeamProfile, TeamRow } from "@shared/teams/row";

import { avatarUrlFromS3Key } from "../avatars/urls";
import { getOrg, listTeamsForOrg, type UserTeamRecord } from "../db/membership";

export function resolveTeamProfile(record: UserTeamRecord): TeamProfile {
  return {
    id: record.id,
    name: record.name,
    avatarUrl: avatarUrlFromS3Key("team", record.id, record.teamAvatarS3Key),
    orgId: record.orgId,
    orgName: record.orgName,
    orgAvatarUrl: avatarUrlFromS3Key("org", record.orgId, record.orgAvatarS3Key),
  };
}

export function listTeamRowsForOrg(db: Database, orgId: string): TeamRow<OrgTeamContext>[] {
  const org = getOrg(db, orgId);
  if (org === null) return [];

  const teams = listTeamsForOrg(db, orgId);
  const orgAvatarUrl = avatarUrlFromS3Key("org", orgId, org.avatarS3Key);

  return teams.map((team) => ({
    team: {
      id: team.id,
      name: team.name,
      avatarUrl: avatarUrlFromS3Key("team", team.id, team.avatarS3Key),
      orgId,
      orgName: org.name,
      orgAvatarUrl,
    },
    context: {
      kind: "org_team" as const,
      memberCount: team.memberCount,
    },
  }));
}
