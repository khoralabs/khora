// Authz reference: apps/khoralabs/exedra/docs/authz-grants.md

import type { EntityRef } from "@khoralabs/exedra-authz";
import { EntityType, Feature, Relation } from "@khoralabs/exedra-authz";
import type { OrgPermission, TeamPermission } from "../../shared/authz/permissions";
import {
  OrgPermission as OrgPermissionKey,
  TeamPermission as TeamPermissionKey,
} from "../../shared/authz/permissions";
import { getDb } from "../db/index";
import { requireAuthzServiceClient } from "./service-client";

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

export { Feature };

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

export function accountScope(accountId: string): EntityRef {
  return { type: ScopeType.Account, id: accountId };
}

export function teamScope(teamId: string): EntityRef {
  return { type: ScopeType.Team, id: teamId };
}

function sessionResource(sessionId: string): EntityRef {
  return { type: ResourceType.Session, id: sessionId };
}

export function threadResource(threadId: string): EntityRef {
  return { type: ResourceType.Thread, id: threadId };
}

function accountResource(accountId: string): EntityRef {
  return { type: ResourceType.Account, id: accountId };
}

export async function enforce(
  accountId: string,
  action: AuthAction,
  resource: AuthResource,
): Promise<boolean> {
  const client = requireAuthzServiceClient();
  const result = await client.decide({
    subject: accountScope(accountId),
    action,
    resource,
  });
  return result.allowed;
}

export async function hasGrant(
  scope: EntityRef,
  resource: EntityRef,
  feature: string,
): Promise<boolean> {
  const client = requireAuthzServiceClient();
  const result = await client.hasGrant({ scope, resource, feature });
  return result.hasGrant;
}

export async function getOrgIdForTeam(teamId: string): Promise<string | null> {
  const client = requireAuthzServiceClient();
  const result = await client.getOrgIdForTeam({ teamId });
  return result.orgId;
}

export async function listTeamIdsForOrg(orgId: string): Promise<string[]> {
  const client = requireAuthzServiceClient();
  const result = await client.listTeamIdsForOrg({ orgId });
  return result.teamIds;
}

export async function listGrantScopeIdsForResource(
  resource: EntityRef,
  feature: string,
  scopeType: string,
): Promise<string[]> {
  const client = requireAuthzServiceClient();
  const result = await client.listGrantScopesForResource({ resource, feature, scopeType });
  return result.scopeIds;
}

export async function hasOrgAdminGrant(accountId: string, orgId: string): Promise<boolean> {
  return hasGrant(
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    Feature.Admin,
  );
}

export async function hasTeamAdminGrant(accountId: string, teamId: string): Promise<boolean> {
  return hasGrant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Admin);
}

export async function hasOrgPermission(
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): Promise<boolean> {
  return enforce(accountId, `org:${permission}` as AuthAction, {
    type: ResourceType.Organization,
    id: orgId,
  });
}

export async function hasTeamPermission(
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): Promise<boolean> {
  return enforce(accountId, `team:${permission}` as AuthAction, {
    type: ResourceType.Team,
    id: teamId,
  });
}

export async function userBelongsToOrg(orgId: string, accountId: string): Promise<boolean> {
  return enforce(accountId, "org:member", { type: ResourceType.Organization, id: orgId });
}

export async function canEditOrg(accountId: string, orgId: string): Promise<boolean> {
  return enforce(accountId, "org:write", { type: ResourceType.Organization, id: orgId });
}

export async function canEditTeam(accountId: string, teamId: string): Promise<boolean> {
  return enforce(accountId, "team:write", { type: ResourceType.Team, id: teamId });
}

export async function canCreateSession(accountId: string, teamId: string): Promise<boolean> {
  return enforce(accountId, "team:session_create", { type: ResourceType.Team, id: teamId });
}

export async function canManageOrgPermissions(accountId: string, orgId: string): Promise<boolean> {
  return enforce(accountId, "org:permissions_manage", {
    type: ResourceType.Organization,
    id: orgId,
  });
}

export async function canManageTeamPermissions(
  accountId: string,
  _teamId: string,
  orgId: string,
): Promise<boolean> {
  return canManageOrgPermissions(accountId, orgId);
}

export async function hasDirectSessionGrant(
  accountId: string,
  sessionId: string,
  feature: string,
): Promise<boolean> {
  return hasGrant(accountScope(accountId), sessionResource(sessionId), feature);
}

export async function canContributeToSessionKg(
  accountId: string,
  sessionId: string,
): Promise<boolean> {
  return (
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Participant)) ||
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin))
  );
}

export async function canReadSessionKg(accountId: string, sessionId: string): Promise<boolean> {
  return (
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Read)) ||
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Participant)) ||
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin))
  );
}

export async function hasTeamContributorGrant(accountId: string, teamId: string): Promise<boolean> {
  return hasGrant(
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Contributor,
  );
}

export async function canContributeToTeamKg(accountId: string, teamId: string): Promise<boolean> {
  return (
    (await enforce(accountId, "team:member", { type: ResourceType.Team, id: teamId })) ||
    (await hasTeamContributorGrant(accountId, teamId))
  );
}

export async function canReadPersonalKg(readerId: string, ownerId: string): Promise<boolean> {
  if (readerId === ownerId) return true;
  return hasGrant(accountScope(readerId), accountResource(ownerId), Feature.Read);
}

export async function hasSessionAccess(accountId: string, sessionId: string): Promise<boolean> {
  if (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin)) return true;
  if (await hasDirectSessionGrant(accountId, sessionId, Feature.Participant)) return true;
  if (await hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Participant);
}

export async function isSessionFacilitator(accountId: string, sessionId: string): Promise<boolean> {
  return (
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin)) ||
    (await hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Admin))
  );
}

export async function canManageSession(accountId: string, sessionId: string): Promise<boolean> {
  return (
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin)) ||
    (await hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Admin))
  );
}

export async function hasFacilitationAccess(
  accountId: string,
  sessionId: string,
): Promise<boolean> {
  return (
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Admin)) ||
    (await hasDirectSessionGrant(accountId, sessionId, Feature.Facilitation)) ||
    (await hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Admin)) ||
    (await hasInheritedTeamSessionGrant(accountId, sessionId, Feature.Facilitation))
  );
}

export async function canViewSession(accountId: string, sessionId: string): Promise<boolean> {
  return enforce(accountId, "session:view", { type: ResourceType.Session, id: sessionId });
}

export async function canWriteFacilitationThread(
  accountId: string,
  threadId: string,
): Promise<boolean> {
  const row = getDb()
    .query<{ session_id: string; kind: string }, [string]>(
      `SELECT session_id, kind FROM threads WHERE id = ? LIMIT 1`,
    )
    .get(threadId);
  if (row === null || row.kind !== "facilitation") return false;
  if (!(await hasFacilitationAccess(accountId, row.session_id))) return false;
  return (
    (await hasGrant(accountScope(accountId), threadResource(threadId), Feature.Write)) ||
    (await canManageSession(accountId, row.session_id))
  );
}

export async function canReadThread(accountId: string, threadId: string): Promise<boolean> {
  return enforce(accountId, "thread:read", { type: ResourceType.Thread, id: threadId });
}

async function hasInheritedTeamSessionGrant(
  accountId: string,
  sessionId: string,
  feature: string,
): Promise<boolean> {
  for (const teamId of await listGrantScopeIdsForResource(
    sessionResource(sessionId),
    feature,
    ScopeType.Team,
  )) {
    if (
      await hasGrant(
        accountScope(accountId),
        { type: ResourceType.Team, id: teamId },
        Feature.Member,
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function grantTeamMember(accountId: string, teamId: string): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Member,
  });
  await client.relate({
    from: accountScope(accountId),
    relation: Relation.MemberOf,
    to: { type: ResourceType.Team, id: teamId },
  });
  return id;
}

export async function grantTeamAdmin(accountId: string, teamId: string): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Admin,
  });
  return id;
}

export async function grantOrgAdmin(accountId: string, orgId: string): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Organization, id: orgId },
    feature: Feature.Admin,
  });
  return id;
}

export async function grantTeamOrgMembership(teamId: string, orgId: string): Promise<string> {
  const client = requireAuthzServiceClient();
  await client.revokeGrantsForScopeFeature({
    scope: teamScope(teamId),
    feature: Feature.Member,
    resourceType: ResourceType.Organization,
  });
  const existingOrgs = await client.listRelatedTo({
    entity: teamScope(teamId),
    relation: Relation.MemberOf,
    filterType: EntityType.Organization,
  });
  for (const existingOrg of existingOrgs.entities) {
    if (existingOrg.id !== orgId) {
      await client.revokeRelationship({
        from: teamScope(teamId),
        relation: Relation.MemberOf,
        to: existingOrg,
      });
    }
  }
  const { id } = await client.grant({
    scope: teamScope(teamId),
    resource: { type: ResourceType.Organization, id: orgId },
    feature: Feature.Member,
  });
  await client.relate({
    from: teamScope(teamId),
    relation: Relation.MemberOf,
    to: { type: ResourceType.Organization, id: orgId },
  });
  return id;
}

export async function revokeTeamMember(accountId: string, teamId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Member,
  });
  await client.revokeRelationship({
    from: accountScope(accountId),
    relation: Relation.MemberOf,
    to: { type: ResourceType.Team, id: teamId },
  });
}

export async function revokeTeamAdmin(accountId: string, teamId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Admin,
  });
}

export async function revokeOrgAdmin(accountId: string, orgId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Organization, id: orgId },
    feature: Feature.Admin,
  });
}

export async function grantSessionReader(
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Read,
    expiresAtMs,
  });
  return id;
}

export async function revokeSessionReader(accountId: string, sessionId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Read,
  });
}

export async function grantTeamContributor(
  accountId: string,
  teamId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Contributor,
    expiresAtMs,
  });
  return id;
}

export async function revokeTeamContributor(accountId: string, teamId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: { type: ResourceType.Team, id: teamId },
    feature: Feature.Contributor,
  });
}

export async function grantPersonalKgReader(
  readerId: string,
  ownerId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(readerId),
    resource: accountResource(ownerId),
    feature: Feature.Read,
    expiresAtMs,
  });
  return id;
}

export async function revokePersonalKgReader(readerId: string, ownerId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(readerId),
    resource: accountResource(ownerId),
    feature: Feature.Read,
  });
}

export async function grantSessionParticipant(
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Participant,
    expiresAtMs,
  });
  return id;
}

export async function grantSessionAdmin(
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Admin,
    expiresAtMs,
  });
  return id;
}

export async function grantTeamSessionParticipant(
  teamId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: teamScope(teamId),
    resource: sessionResource(sessionId),
    feature: Feature.Participant,
    expiresAtMs,
  });
  return id;
}

export async function grantTeamSessionAdmin(
  teamId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: teamScope(teamId),
    resource: sessionResource(sessionId),
    feature: Feature.Admin,
    expiresAtMs,
  });
  return id;
}

export async function grantTeamSessionFacilitation(
  teamId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: teamScope(teamId),
    resource: sessionResource(sessionId),
    feature: Feature.Facilitation,
    expiresAtMs,
  });
  return id;
}

export async function revokeTeamSessionFacilitation(
  teamId: string,
  sessionId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: teamScope(teamId),
    resource: sessionResource(sessionId),
    feature: Feature.Facilitation,
  });
}

export async function revokeSessionParticipant(
  accountId: string,
  sessionId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Participant,
  });
}

export async function revokeTeamSessionParticipant(
  teamId: string,
  sessionId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: teamScope(teamId),
    resource: sessionResource(sessionId),
    feature: Feature.Participant,
  });
}

export async function grantSessionFacilitation(
  accountId: string,
  sessionId: string,
  expiresAtMs?: number | null,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Facilitation,
    expiresAtMs,
  });
  return id;
}

export async function revokeSessionFacilitation(
  accountId: string,
  sessionId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({
    scope: accountScope(accountId),
    resource: sessionResource(sessionId),
    feature: Feature.Facilitation,
  });
}

export async function grantThreadAccess(accountId: string, threadId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.grant({
    scope: accountScope(accountId),
    resource: threadResource(threadId),
    feature: Feature.Read,
  });
  await client.grant({
    scope: accountScope(accountId),
    resource: threadResource(threadId),
    feature: Feature.Write,
  });
}

export async function grantSessionCreatorAccess(
  accountId: string,
  sessionId: string,
): Promise<void> {
  await grantSessionAdmin(accountId, sessionId);
}

export async function revokeAllGrantsForTeamScope(teamId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrantsForScopeFeature({
    scope: teamScope(teamId),
    feature: Feature.Member,
    resourceType: ResourceType.Organization,
  });
}

export async function revokeAllGrantsReferencingTeam(teamId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrantsReferencingResource({
    resource: { type: ResourceType.Team, id: teamId },
  });
}

export async function revokeAllGrantsReferencingOrg(orgId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrantsReferencingResource({
    resource: { type: ResourceType.Organization, id: orgId },
  });
}

export async function listAccountIdsForTeam(
  teamId: string,
  feature = Feature.Member,
): Promise<string[]> {
  const client = requireAuthzServiceClient();
  const result = await client.listAccountIdsForTeam({ teamId, feature });
  return result.accountIds;
}

export async function listAccountIdsForOrgAdmin(orgId: string): Promise<string[]> {
  const client = requireAuthzServiceClient();
  const result = await client.listAccountIdsForOrgAdmin({ orgId });
  return result.accountIds;
}

export async function userHasAnyTeamMemberGrant(accountId: string): Promise<boolean> {
  const client = requireAuthzServiceClient();
  const result = await client.scopeHasAnyGrant({
    scope: accountScope(accountId),
    resourceType: EntityType.Team,
    feature: Feature.Member,
  });
  return result.hasGrant;
}

export async function userHasAnySessionParticipantGrant(accountId: string): Promise<boolean> {
  const client = requireAuthzServiceClient();
  const result = await client.scopeHasAnyGrant({
    scope: accountScope(accountId),
    resourceType: EntityType.Session,
    feature: Feature.Participant,
  });
  return result.hasGrant;
}

export { OrgPermissionKey, TeamPermissionKey };
