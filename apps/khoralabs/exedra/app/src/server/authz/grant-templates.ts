import type { Database } from "bun:sqlite";

import {
  ORG_PERMISSIONS,
  type OrgPermission,
  orgPermissionGrantTemplates,
  TEAM_PERMISSIONS,
  type TeamPermission,
  teamPermissionGrantTemplates,
} from "../../shared/authz/permissions";
import { grant, hasGrant, listTeamIdsForOrg, revokeGrant } from "./grants";
import { accountScope, Feature, ResourceType, teamScope } from "./policy";

export function grantOrgPermission(
  db: Database,
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): string {
  return grant(
    db,
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    permission,
  );
}

export function revokeOrgPermission(
  db: Database,
  accountId: string,
  orgId: string,
  permission: OrgPermission,
): void {
  revokeGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Organization, id: orgId },
    permission,
  );
}

export function grantTeamPermission(
  db: Database,
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): string {
  return grant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission);
}

export function revokeTeamPermission(
  db: Database,
  accountId: string,
  teamId: string,
  permission: TeamPermission,
): void {
  revokeGrant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, permission);
}

export function grantTeamScopePermission(
  db: Database,
  teamId: string,
  permission: TeamPermission,
): string {
  return grant(db, teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission);
}

export function revokeTeamScopePermission(
  db: Database,
  teamId: string,
  permission: TeamPermission,
): void {
  revokeGrant(db, teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission);
}

export function grantTeamScopeOrgPermission(
  db: Database,
  teamId: string,
  orgId: string,
  permission: OrgPermission,
): string {
  return grant(db, teamScope(teamId), { type: ResourceType.Organization, id: orgId }, permission);
}

export function revokeTeamScopeOrgPermission(
  db: Database,
  teamId: string,
  orgId: string,
  permission: OrgPermission,
): void {
  revokeGrant(db, teamScope(teamId), { type: ResourceType.Organization, id: orgId }, permission);
}

export function grantAllOrgPermissions(db: Database, accountId: string, orgId: string): void {
  for (const template of orgPermissionGrantTemplates(orgId)) {
    grantOrgPermission(db, accountId, orgId, template.feature);
  }
  grant(db, accountScope(accountId), { type: ResourceType.Organization, id: orgId }, Feature.Admin);
}

export function grantAllTeamPermissions(db: Database, accountId: string, teamId: string): void {
  for (const template of teamPermissionGrantTemplates(teamId)) {
    grantTeamPermission(db, accountId, teamId, template.feature);
  }
  grant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Member);
  grant(db, accountScope(accountId), { type: ResourceType.Team, id: teamId }, Feature.Admin);
}

export function listOrgPermissionsForAccount(
  db: Database,
  accountId: string,
  orgId: string,
  nowMs = Date.now(),
): OrgPermission[] {
  return ORG_PERMISSIONS.filter((permission) =>
    hasGrant(
      db,
      accountScope(accountId),
      { type: ResourceType.Organization, id: orgId },
      permission,
      nowMs,
    ),
  );
}

export function listTeamScopeOrgPermissions(
  db: Database,
  teamId: string,
  orgId: string,
  nowMs = Date.now(),
): OrgPermission[] {
  return ORG_PERMISSIONS.filter((permission) =>
    hasGrant(
      db,
      teamScope(teamId),
      { type: ResourceType.Organization, id: orgId },
      permission,
      nowMs,
    ),
  );
}

function listTeamIdsForAccountInOrg(
  db: Database,
  orgId: string,
  accountId: string,
  nowMs = Date.now(),
): string[] {
  return listTeamIdsForOrg(db, orgId, nowMs).filter((teamId) =>
    hasGrant(
      db,
      accountScope(accountId),
      { type: ResourceType.Team, id: teamId },
      Feature.Member,
      nowMs,
    ),
  );
}

export function listEffectiveOrgPermissionsForAccount(
  db: Database,
  accountId: string,
  orgId: string,
  nowMs = Date.now(),
): OrgPermission[] {
  const granted = new Set(listOrgPermissionsForAccount(db, accountId, orgId, nowMs));
  for (const teamId of listTeamIdsForAccountInOrg(db, orgId, accountId, nowMs)) {
    for (const permission of listTeamScopeOrgPermissions(db, teamId, orgId, nowMs)) {
      granted.add(permission);
    }
  }
  return ORG_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function listTeamPermissionsForAccount(
  db: Database,
  accountId: string,
  teamId: string,
  nowMs = Date.now(),
): TeamPermission[] {
  return TEAM_PERMISSIONS.filter((permission) =>
    hasGrant(
      db,
      accountScope(accountId),
      { type: ResourceType.Team, id: teamId },
      permission,
      nowMs,
    ),
  );
}

export function listTeamScopePermissions(
  db: Database,
  teamId: string,
  nowMs = Date.now(),
): TeamPermission[] {
  return TEAM_PERMISSIONS.filter((permission) =>
    hasGrant(db, teamScope(teamId), { type: ResourceType.Team, id: teamId }, permission, nowMs),
  );
}

export function listEffectiveTeamPermissionsForAccount(
  db: Database,
  accountId: string,
  teamId: string,
  nowMs = Date.now(),
): TeamPermission[] {
  const granted = new Set(listTeamPermissionsForAccount(db, accountId, teamId, nowMs));
  const isMember = hasGrant(
    db,
    accountScope(accountId),
    { type: ResourceType.Team, id: teamId },
    Feature.Member,
    nowMs,
  );
  if (isMember) {
    for (const permission of listTeamScopePermissions(db, teamId, nowMs)) {
      granted.add(permission);
    }
  }
  return TEAM_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function setOrgPermissionsForAccount(
  db: Database,
  accountId: string,
  orgId: string,
  permissions: readonly OrgPermission[],
): void {
  const desired = new Set(permissions);
  for (const permission of ORG_PERMISSIONS) {
    if (desired.has(permission)) {
      grantOrgPermission(db, accountId, orgId, permission);
    } else {
      revokeOrgPermission(db, accountId, orgId, permission);
    }
  }
}

export function setTeamPermissionsForAccount(
  db: Database,
  accountId: string,
  teamId: string,
  permissions: readonly TeamPermission[],
): void {
  const desired = new Set(permissions);
  for (const permission of TEAM_PERMISSIONS) {
    if (desired.has(permission)) {
      grantTeamPermission(db, accountId, teamId, permission);
    } else {
      revokeTeamPermission(db, accountId, teamId, permission);
    }
  }
}

export function setTeamScopePermissions(
  db: Database,
  teamId: string,
  permissions: readonly TeamPermission[],
): void {
  const desired = new Set(permissions);
  for (const permission of TEAM_PERMISSIONS) {
    if (desired.has(permission)) {
      grantTeamScopePermission(db, teamId, permission);
    } else {
      revokeTeamScopePermission(db, teamId, permission);
    }
  }
}

export function setTeamScopeOrgPermissions(
  db: Database,
  teamId: string,
  orgId: string,
  permissions: readonly OrgPermission[],
): void {
  const desired = new Set(permissions);
  for (const permission of ORG_PERMISSIONS) {
    if (desired.has(permission)) {
      grantTeamScopeOrgPermission(db, teamId, orgId, permission);
    } else {
      revokeTeamScopeOrgPermission(db, teamId, orgId, permission);
    }
  }
}
