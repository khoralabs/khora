// Authz reference: apps/khoralabs/exedra/docs/authz-grants.md
import type { Database } from "bun:sqlite";

import type { OrgPermission, TeamPermission } from "../../shared/authz/permissions";
import {
  OrgPermission as OrgPermissionKey,
  TeamPermission as TeamPermissionKey,
} from "../../shared/authz/permissions";
import {
  grant as createGrant,
  getOrgIdForTeam,
  hasGrant,
  listGrantScopeIdsForResource,
  listTeamIdsForOrg,
  revokeActiveGrantsForScopeFeature,
  revokeGrant,
} from "./grants";

export const ScopeType = {
  Organization: "org",
  Team: "team",
  Account: "account",
  Session: "session",
} as const;

export const ResourceType = {
  Organization: "org",
  Team: "team",
  Session: "session",
  Thread: "thread",
  Account: "account",
} as const;

export const Feature = {
  Member: "member",
  Admin: "admin",
  Participant: "participant",
  Facilitation: "facilitation",
  Read: "read",
  Write: "write",
  Contributor: "contributor",
} as const;

export type AuthAction =
  | "team:member"
  | "team:admin"
  | "team:read"
  | "team:write"
  | "team:member_manage"
  | "team:session_create"
  | "org:member"
  | "org:admin"
  | "org:read"
  | "org:write"
  | "org:permissions_manage"
  | "org:team_manage"
  | "org:member_manage"
  | "org:session_create"
  | "session:view"
  | "thread:read";

export type AuthResource =
  | { type: typeof ResourceType.Team; id: string }
  | { type: typeof ResourceType.Organization; id: string }
  | { type: typeof ResourceType.Session; id: string }
  | { type: typeof ResourceType.Thread; id: string };

export function accountScope(accountId: string) {
  return { type: ScopeType.Account, id: accountId };
}

export function teamScope(teamId: string) {
  return { type: ScopeType.Team, id: teamId };
}

export function enforce(
  db: Database,
  accountId: string,
  action: AuthAction,
  resource: AuthResource,
): boolean {
  switch (action) {
    case "team:member":
      if (resource.type !== ResourceType.Team) return false;
      return hasGrant(
        db,
        accountScope(accountId),
        { type: ResourceType.Team, id: resource.id },
        Feature.Member,
      );

    case "team:admin":
      if (resource.type !== ResourceType.Team) return false;
      return hasTeamPermission(db, accountId, resource.id, TeamPermissionKey.Write);

    case "team:read":
      if (resource.type !== ResourceType.Team) return false;
      return hasTeamPermission(db, accountId, resource.id, TeamPermissionKey.Read);

    case "team:write":
      if (resource.type !== ResourceType.Team) return false;
      return hasTeamPermission(db, accountId, resource.id, TeamPermissionKey.Write);

    case "team:member_manage":
      if (resource.type !== ResourceType.Team) return false;
      return hasTeamPermission(db, accountId, resource.id, TeamPermissionKey.MemberManage);

    case "team:session_create":
      if (resource.type !== ResourceType.Team) return false;
      return canCreateSession(db, accountId, resource.id);

    case "org:member":
      if (resource.type !== ResourceType.Organization) return false;
      return userBelongsToOrg(db, resource.id, accountId);

    case "org:admin":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.PermissionsManage);

    case "org:read":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.Read);

    case "org:write":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.Write);

    case "org:permissions_manage":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.PermissionsManage);

    case "org:team_manage":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.TeamManage);

    case "org:member_manage":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.MemberManage);

    case "org:session_create":
      if (resource.type !== ResourceType.Organization) return false;
      return hasOrgPermission(db, accountId, resource.id, OrgPermissionKey.SessionCreate);

    case "session:view":
      if (resource.type !== ResourceType.Session) return false;
      return canViewSession(db, accountId, resource.id);

    case "thread:read":
      if (resource.type !== ResourceType.Thread) return false;
      return canReadThread(db, accountId, resource.id);

    default:
      return false;
  }
}

export function hasOrgAdminGrant(db: Database, accountId: string, orgId: string): boolean {
  return hasGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    Feature.Admin,
  );
}

export function hasTeamAdminGrant(db: Database, accountId: string, teamId: string): boolean {
  return hasGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Admin,
  );
}

export function hasOrgPermission(
  db: Database,
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): boolean {
  if (hasOrgAdminGrant(db, accountId, orgId)) return true;
  if (permission === OrgPermissionKey.Read && userBelongsToOrg(db, orgId, accountId)) {
    return true;
  }
  if (
    hasGrant(
      db,
      accountScope(accountId),
      { type: ResourceType.Organization, id: orgId },
      permission,
    )
  ) {
    return true;
  }
  for (const teamId of listTeamIdsForOrg(db, orgId)) {
    if (
      !hasGrant(
        db,
        accountScope(accountId),
        { type: ResourceType.Team, id: teamId },
        Feature.Member,
      )
    ) {
      continue;
    }
    if (
      hasGrant(db, teamScope(teamId), { type: ResourceType.Organization, id: orgId }, permission)
    ) {
      return true;
    }
  }
  return false;
}

export function hasTeamPermission(
  db: Database,
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): boolean {
  if (hasTeamAdminGrant(db, accountId, teamId)) return true;
  if (hasGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission)) {
    return true;
  }
  const isMember = hasGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Member,
  );
  if (
    isMember &&
    hasGrant(db, teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission)
  ) {
    return true;
  }
  if (permission === TeamPermissionKey.Read && isMember) {
    return true;
  }
  return false;
}

export function userBelongsToOrg(db: Database, orgId: string, accountId: string): boolean {
  const teamIds = listTeamIdsForOrg(db, orgId);
  for (const teamId of teamIds) {
    if (
      hasGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Member)
    ) {
      return true;
    }
  }
  return false;
}

export function canEditOrg(db: Database, accountId: string, orgId: string): boolean {
  return enforce(db, accountId, "org:write", { type: ResourceType.Organization, id: orgId });
}

export function canEditTeam(db: Database, accountId: string, teamId: string): boolean {
  return enforce(db, accountId, "team:write", { type: ResourceType.Team, id: teamId });
}

export function canCreateSession(db: Database, accountId: string, teamId: string): boolean {
  if (!enforce(db, accountId, "team:member", { type: ResourceType.Team, id: teamId })) {
    return false;
  }
  const orgId = getOrgIdForTeam(db, teamId);
  if (orgId === null) return false;
  return (
    hasTeamPermission(db, accountId, teamId, TeamPermissionKey.SessionCreate) &&
    hasOrgPermission(db, accountId, orgId, OrgPermissionKey.SessionCreate)
  );
}

export function canManageOrgPermissions(db: Database, accountId: string, orgId: string): boolean {
  return enforce(db, accountId, "org:permissions_manage", {
    type: ResourceType.Organization,
    id: orgId,
  });
}

export function canManageTeamPermissions(
  db: Database,
  accountId: string,
  _teamId: string,
  orgId: string,
): boolean {
  return canManageOrgPermissions(db, accountId, orgId);
}

function sessionResource(sessionId: string) {
  return { type: ResourceType.Session, id: sessionId };
}

export function threadResource(threadId: string) {
  return { type: ResourceType.Thread, id: threadId };
}

function accountResource(accountId: string) {
  return { type: ResourceType.Account, id: accountId };
}

function hasAccountSessionGrant(
  db: Database,
  accountId: string,
  sessionId: string,
  feature: string,
): boolean {
  return hasGrant(db, accountScope(accountId), sessionResource(sessionId), feature);
}

export function hasDirectSessionGrant(
  db: Database,
  accountId: string,
  sessionId: string,
  feature: string,
): boolean {
  return hasAccountSessionGrant(db, accountId, sessionId, feature);
}

export function canContributeToSessionKg(
  db: Database,
  accountId: string,
  sessionId: string,
): boolean {
  return (
    hasDirectSessionGrant(db, accountId, sessionId, Feature.Participant) ||
    hasDirectSessionGrant(db, accountId, sessionId, Feature.Admin)
  );
}

export function canReadSessionKg(db: Database, accountId: string, sessionId: string): boolean {
  return (
    hasDirectSessionGrant(db, accountId, sessionId, Feature.Read) ||
    hasDirectSessionGrant(db, accountId, sessionId, Feature.Participant) ||
    hasDirectSessionGrant(db, accountId, sessionId, Feature.Admin)
  );
}

export function hasTeamContributorGrant(db: Database, accountId: string, teamId: string): boolean {
  return hasGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Contributor,
  );
}

export function canContributeToTeamKg(db: Database, accountId: string, teamId: string): boolean {
  return (
    enforce(db, accountId, "team:member", { type: ResourceType.Team, id: teamId }) ||
    hasTeamContributorGrant(db, accountId, teamId)
  );
}

export function canReadPersonalKg(db: Database, readerId: string, ownerId: string): boolean {
  if (readerId === ownerId) return true;
  return hasGrant(db, accountScope(readerId), accountResource(ownerId), Feature.Read);
}

function hasInheritedTeamSessionGrant(
  db: Database,
  accountId: string,
  sessionId: string,
  feature: string,
): boolean {
  for (const teamId of listGrantScopeIdsForResource(
    db,
    sessionResource(sessionId),
    feature,
    ScopeType.Team,
  )) {
    if (
      hasGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Member)
    ) {
      return true;
    }
  }
  return false;
}

export function hasSessionAccess(db: Database, accountId: string, sessionId: string): boolean {
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Participant)) return true;
  if (hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Participant);
}

export function isSessionFacilitator(db: Database, accountId: string, sessionId: string): boolean {
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Admin);
}

export function canManageSession(db: Database, accountId: string, sessionId: string): boolean {
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Admin);
}

export function hasFacilitationAccess(db: Database, accountId: string, sessionId: string): boolean {
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  if (hasAccountSessionGrant(db, accountId, sessionId, Feature.Facilitation)) return true;
  if (hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(db, accountId, sessionId, Feature.Facilitation);
}

export function canViewSession(db: Database, accountId: string, sessionId: string): boolean {
  return (
    hasSessionAccess(db, accountId, sessionId) || hasFacilitationAccess(db, accountId, sessionId)
  );
}

export function canWriteFacilitationThread(
  db: Database,
  accountId: string,
  threadId: string,
): boolean {
  const row = db
    .query<{ session_id: string; kind: string }, [string]>(
      `SELECT session_id, kind FROM threads WHERE id = ? LIMIT 1`,
    )
    .get(threadId);
  if (row === null || row.kind !== "facilitation") return false;
  if (!hasFacilitationAccess(db, accountId, row.session_id)) return false;
  return (
    hasGrant(db, accountScope(accountId), threadResource(threadId), Feature.Write) ||
    canManageSession(db, accountId, row.session_id)
  );
}

export function canReadThread(db: Database, accountId: string, threadId: string): boolean {
  const row = db
    .query<{ session_id: string; kind: string }, [string]>(
      `SELECT session_id, kind FROM threads WHERE id = ? LIMIT 1`,
    )
    .get(threadId);
  if (row === null) return false;
  if (
    hasGrant(db, accountScope(accountId), threadResource(threadId), Feature.Read) ||
    hasGrant(db, accountScope(accountId), threadResource(threadId), Feature.Write)
  ) {
    return true;
  }
  if (row.kind === "facilitation") {
    return hasFacilitationAccess(db, accountId, row.session_id);
  }
  return canManageSession(db, accountId, row.session_id);
}

export function grantTeamMember(db: Database, accountId: string, teamId: string): string {
  return createGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Member,
  );
}

export function grantTeamAdmin(db: Database, accountId: string, teamId: string): string {
  return createGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Admin,
  );
}

export function grantOrgAdmin(db: Database, accountId: string, orgId: string): string {
  return createGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    Feature.Admin,
  );
}

export function grantTeamOrgMembership(db: Database, teamId: string, orgId: string): string {
  revokeActiveGrantsForScopeFeature(
    db,
    teamScope(teamId),
    Feature.Member,
    ResourceType.Organization,
  );
  return createGrant(
    db,
    teamScope(teamId),
    { type: ResourceType.Organization, id: orgId },
    Feature.Member,
  );
}

export function revokeTeamMember(db: Database, accountId: string, teamId: string): void {
  revokeGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Member);
}

export function revokeTeamAdmin(db: Database, accountId: string, teamId: string): void {
  revokeGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Admin);
}

export function revokeOrgAdmin(db: Database, accountId: string, orgId: string): void {
  revokeGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    Feature.Admin,
  );
}

export function grantSessionReader(
  db: Database,
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(accountId),
    sessionResource(sessionId),
    Feature.Read,
    expiresAtMs,
  );
}

export function revokeSessionReader(db: Database, accountId: string, sessionId: string): void {
  revokeGrant(db, accountScope(accountId), sessionResource(sessionId), Feature.Read);
}

export function grantTeamContributor(
  db: Database,
  accountId: string,
  teamId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Contributor,
    expiresAtMs,
  );
}

export function revokeTeamContributor(db: Database, accountId: string, teamId: string): void {
  revokeGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Contributor,
  );
}

export function grantPersonalKgReader(
  db: Database,
  readerId: string,
  ownerId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(readerId),
    accountResource(ownerId),
    Feature.Read,
    expiresAtMs,
  );
}

export function revokePersonalKgReader(db: Database, readerId: string, ownerId: string): void {
  revokeGrant(db, accountScope(readerId), accountResource(ownerId), Feature.Read);
}

export function grantSessionParticipant(
  db: Database,
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(accountId),
    sessionResource(sessionId),
    Feature.Participant,
    expiresAtMs,
  );
}

export function grantSessionAdmin(
  db: Database,
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(accountId),
    sessionResource(sessionId),
    Feature.Admin,
    expiresAtMs,
  );
}

export function grantTeamSessionParticipant(
  db: Database,
  teamId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    teamScope(teamId),
    sessionResource(sessionId),
    Feature.Participant,
    expiresAtMs,
  );
}

export function grantTeamSessionAdmin(
  db: Database,
  teamId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(db, teamScope(teamId), sessionResource(sessionId), Feature.Admin, expiresAtMs);
}

export function revokeSessionParticipant(db: Database, accountId: string, sessionId: string): void {
  revokeGrant(db, accountScope(accountId), sessionResource(sessionId), Feature.Participant);
}

export function revokeTeamSessionParticipant(
  db: Database,
  teamId: string,
  sessionId: string,
): void {
  revokeGrant(db, teamScope(teamId), sessionResource(sessionId), Feature.Participant);
}

export function grantSessionFacilitation(
  db: Database,
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): string {
  return createGrant(
    db,
    accountScope(accountId),
    sessionResource(sessionId),
    Feature.Facilitation,
    expiresAtMs,
  );
}

export function revokeSessionFacilitation(
  db: Database,
  accountId: string,
  sessionId: string,
): void {
  revokeGrant(db, accountScope(accountId), sessionResource(sessionId), Feature.Facilitation);
}

export function grantThreadAccess(db: Database, accountId: string, threadId: string): void {
  createGrant(db, accountScope(accountId), threadResource(threadId), Feature.Read);
  createGrant(db, accountScope(accountId), threadResource(threadId), Feature.Write);
}

/** Issue facilitator (admin) grant for a session creator. */
export function grantSessionCreatorAccess(
  db: Database,
  accountId: string,
  sessionId: string,
): void {
  grantSessionAdmin(db, accountId, sessionId);
}

export { getOrgIdForTeam };
