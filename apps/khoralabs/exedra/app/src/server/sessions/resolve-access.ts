import type { Database } from "bun:sqlite";

import type { SessionAccess, SessionAccessEntry } from "@shared/sessions/access";

import { listAccountRowsForSession } from "../accounts/resolve-rows";
import { getOrgIdForTeam, listGrantScopeIdsForResource } from "../authz/grants";
import { Feature, ResourceType, ScopeType } from "../authz/policy";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { getOrCreateSessionLinkInvite, getSessionLinkInvite } from "../db/invites";
import { getOrg, getTeam } from "../db/membership";
import { getSessionLinkAccess, getSessionLinkGrantRole } from "../db/sessions";

export function listSessionAccessEntries(
  db: Database,
  sessionId: string,
  viewerId: string,
): SessionAccessEntry[] {
  const entries: SessionAccessEntry[] = [];

  // Account-level entries
  const accountRows = listAccountRowsForSession(db, sessionId, viewerId);
  for (const row of accountRows) {
    entries.push({ kind: "account", ...row });
  }

  // Team-level entries (team-scoped grants on this session)
  const nowMs = Date.now();
  const sessionResource = { type: ResourceType.Session, id: sessionId };

  const participantTeamIds = listGrantScopeIdsForResource(
    db,
    sessionResource,
    Feature.Participant,
    ScopeType.Team,
    nowMs,
  );
  const adminTeamIds = listGrantScopeIdsForResource(
    db,
    sessionResource,
    Feature.Admin,
    ScopeType.Team,
    nowMs,
  );

  const seenTeamIds = new Set<string>();
  for (const [teamId, role] of [
    ...adminTeamIds.map((id) => [id, "facilitator"] as const),
    ...participantTeamIds.map((id) => [id, "participant"] as const),
  ]) {
    if (seenTeamIds.has(teamId)) continue;
    seenTeamIds.add(teamId);

    const team = getTeam(db, teamId);
    if (team === null) continue;
    const org = getOrg(db, team.orgId);

    entries.push({
      kind: "team",
      team: {
        id: team.id,
        name: team.name,
        avatarUrl: avatarUrlFromS3Key("team", team.id, team.avatarS3Key),
        orgId: team.orgId,
        orgName: org?.name ?? "",
        orgAvatarUrl: org !== null ? avatarUrlFromS3Key("org", org.id, org.avatarS3Key) : null,
      },
      role,
    });
  }

  return entries;
}

export function buildSessionAccess(
  db: Database,
  sessionId: string,
  viewerId: string,
  canManage: boolean,
): SessionAccess {
  const linkAccess = getSessionLinkAccess(db, sessionId);
  const linkGrantRole = getSessionLinkGrantRole(db, sessionId);
  let linkUrl: string | null = null;

  if (canManage) {
    const plaintext =
      linkAccess === "anyone"
        ? getOrCreateSessionLinkInvite(db, sessionId, viewerId)
        : getSessionLinkInvite(db, sessionId);
    linkUrl = plaintext !== null ? `/invite/${plaintext}` : null;
  }

  const entries = listSessionAccessEntries(db, sessionId, viewerId);

  const sessionRow = db
    .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  const teamId = sessionRow?.team_id ?? "";
  const orgId = getOrgIdForTeam(db, teamId) ?? "";

  return { linkAccess, linkGrantRole, linkUrl, canManage, teamId, orgId, entries };
}
