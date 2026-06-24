import {
  ORG_PERMISSIONS,
  type OrgPermission,
  orgPermissionGrantTemplates,
  TEAM_PERMISSIONS,
  type TeamPermission,
  teamPermissionGrantTemplates,
} from "../../shared/authz/permissions";
import {
  accountScope,
  Feature,
  grantOrgAdmin,
  hasGrant,
  listTeamIdsForOrg,
  ResourceType,
  teamScope,
} from "./policy";
import { requireAuthzServiceClient } from "./service-client";

async function grant(
  scope: { type: string; id: string },
  resource: { type: string; id: string },
  feature: string,
): Promise<string> {
  const client = requireAuthzServiceClient();
  const { id } = await client.grant({ scope, resource, feature });
  return id;
}

async function revokeGrant(
  scope: { type: string; id: string },
  resource: { type: string; id: string },
  feature: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.revokeGrant({ scope, resource, feature });
}

export async function grantOrgPermission(
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): Promise<string> {
  return grant(accountScope(accountId), { type: ResourceType.Organization, id: orgId }, permission);
}

export async function revokeOrgPermission(
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): Promise<void> {
  await revokeGrant(
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    permission,
  );
}

export async function grantTeamPermission(
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): Promise<string> {
  return grant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission);
}

export async function revokeTeamPermission(
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): Promise<void> {
  await revokeGrant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission);
}

export async function grantTeamScopePermission(
  teamId: string,
  permission: TeamPermission,
): Promise<string> {
  return grant(teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission);
}

export async function revokeTeamScopePermission(
  teamId: string,
  permission: TeamPermission,
): Promise<void> {
  await revokeGrant(teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission);
}

export async function grantTeamScopeOrgPermission(
  teamId: string,
  orgId: string,
  permission: OrgPermission,
): Promise<string> {
  return grant(teamScope(teamId), { type: ResourceType.Organization, id: orgId }, permission);
}

export async function revokeTeamScopeOrgPermission(
  teamId: string,
  orgId: string,
  permission: OrgPermission,
): Promise<void> {
  await revokeGrant(teamScope(teamId), { type: ResourceType.Organization, id: orgId }, permission);
}

export async function grantAllOrgPermissions(accountId: string, orgId: string): Promise<void> {
  for (const template of orgPermissionGrantTemplates(orgId)) {
    await grantOrgPermission(accountId, orgId, template.feature);
  }
  await grantOrgAdmin(accountId, orgId);
}

export async function grantAllTeamPermissions(accountId: string, teamId: string): Promise<void> {
  for (const template of teamPermissionGrantTemplates(teamId)) {
    await grantTeamPermission(accountId, teamId, template.feature);
  }
  await grant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Member);
  await grant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Admin);
}

export async function listOrgPermissionsForAccount(
  accountId: string,
  orgId: string,
): Promise<OrgPermission[]> {
  const results = await Promise.all(
    ORG_PERMISSIONS.map(async (permission) =>
      (await hasGrant(
        accountScope(accountId),
        { type: ResourceType.Organization, id: orgId },
        permission,
      ))
        ? permission
        : null,
    ),
  );
  return results.filter((permission): permission is OrgPermission => permission !== null);
}

export async function listTeamScopeOrgPermissions(
  teamId: string,
  orgId: string,
): Promise<OrgPermission[]> {
  const results = await Promise.all(
    ORG_PERMISSIONS.map(async (permission) =>
      (await hasGrant(
        teamScope(teamId),
        { type: ResourceType.Organization, id: orgId },
        permission,
      ))
        ? permission
        : null,
    ),
  );
  return results.filter((permission): permission is OrgPermission => permission !== null);
}

async function listTeamIdsForAccountInOrg(orgId: string, accountId: string): Promise<string[]> {
  const teamIds = await listTeamIdsForOrg(orgId);
  const memberships = await Promise.all(
    teamIds.map(async (teamId) =>
      (await hasGrant(
        accountScope(accountId),
        { type: ResourceType.Team, id: teamId },
        Feature.Member,
      ))
        ? teamId
        : null,
    ),
  );
  return memberships.filter((teamId): teamId is string => teamId !== null);
}

export async function listEffectiveOrgPermissionsForAccount(
  accountId: string,
  orgId: string,
): Promise<OrgPermission[]> {
  const granted = new Set(await listOrgPermissionsForAccount(accountId, orgId));
  for (const teamId of await listTeamIdsForAccountInOrg(orgId, accountId)) {
    for (const permission of await listTeamScopeOrgPermissions(teamId, orgId)) {
      granted.add(permission);
    }
  }
  return ORG_PERMISSIONS.filter((permission) => granted.has(permission));
}

export async function listTeamPermissionsForAccount(
  accountId: string,
  teamId: string,
): Promise<TeamPermission[]> {
  const results = await Promise.all(
    TEAM_PERMISSIONS.map(async (permission) =>
      (await hasGrant(accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission))
        ? permission
        : null,
    ),
  );
  return results.filter((permission): permission is TeamPermission => permission !== null);
}

export async function listTeamScopePermissions(teamId: string): Promise<TeamPermission[]> {
  const results = await Promise.all(
    TEAM_PERMISSIONS.map(async (permission) =>
      (await hasGrant(teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission))
        ? permission
        : null,
    ),
  );
  return results.filter((permission): permission is TeamPermission => permission !== null);
}

export async function listEffectiveTeamPermissionsForAccount(
  accountId: string,
  teamId: string,
): Promise<TeamPermission[]> {
  const granted = new Set(await listTeamPermissionsForAccount(accountId, teamId));
  const isMember = await hasGrant(
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Member,
  );
  if (isMember) {
    for (const permission of await listTeamScopePermissions(teamId)) {
      granted.add(permission);
    }
  }
  return TEAM_PERMISSIONS.filter((permission) => granted.has(permission));
}

export async function setOrgPermissionsForAccount(
  accountId: string,
  orgId: string,
  permissions: readonly OrgPermission[],
): Promise<void> {
  const desired = new Set(permissions);
  for (const permission of ORG_PERMISSIONS) {
    if (desired.has(permission)) {
      await grantOrgPermission(accountId, orgId, permission);
    } else {
      await revokeOrgPermission(accountId, orgId, permission);
    }
  }
}

export async function setTeamPermissionsForAccount(
  accountId: string,
  teamId: string,
  permissions: readonly TeamPermission[],
): Promise<void> {
  const desired = new Set(permissions);
  for (const permission of TEAM_PERMISSIONS) {
    if (desired.has(permission)) {
      await grantTeamPermission(accountId, teamId, permission);
    } else {
      await revokeTeamPermission(accountId, teamId, permission);
    }
  }
}

export async function setTeamScopePermissions(
  teamId: string,
  permissions: readonly TeamPermission[],
): Promise<void> {
  const desired = new Set(permissions);
  for (const permission of TEAM_PERMISSIONS) {
    if (desired.has(permission)) {
      await grantTeamScopePermission(teamId, permission);
    } else {
      await revokeTeamScopePermission(teamId, permission);
    }
  }
}

export async function setTeamScopeOrgPermissions(
  teamId: string,
  orgId: string,
  permissions: readonly OrgPermission[],
): Promise<void> {
  const desired = new Set(permissions);
  for (const permission of ORG_PERMISSIONS) {
    if (desired.has(permission)) {
      await grantTeamScopeOrgPermission(teamId, orgId, permission);
    } else {
      await revokeTeamScopeOrgPermission(teamId, orgId, permission);
    }
  }
}
