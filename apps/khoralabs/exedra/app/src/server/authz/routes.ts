import {
  ORG_PERMISSIONS,
  type OrgPermission,
  orgPermissionsSnapshot,
  TEAM_PERMISSIONS,
  type TeamPermission,
  teamPermissionsSnapshot,
} from "../../shared/authz/permissions";
import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { getOrg, getTeam, listOrgMembers } from "../db/membership";
import { getOrCreateUser } from "../identity/users";
import {
  listEffectiveOrgPermissionsForAccount,
  listEffectiveTeamPermissionsForAccount,
  listTeamScopeOrgPermissions,
  listTeamScopePermissions,
  setOrgPermissionsForAccount,
  setTeamScopeOrgPermissions,
  setTeamScopePermissions,
} from "./grant-templates";
import {
  canManageOrgPermissions,
  canManageTeamPermissions,
  enforce,
  hasOrgAdminGrant,
  hasTeamAdminGrant,
  ResourceType,
} from "./policy";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function serializeOrgPermissionsForAccount(accountId: string, orgId: string) {
  const granted = await listEffectiveOrgPermissionsForAccount(accountId, orgId);
  const permissions = orgPermissionsSnapshot(granted);
  if (await hasOrgAdminGrant(accountId, orgId)) {
    for (const permission of ORG_PERMISSIONS) {
      permissions[permission] = true;
    }
  }
  return { granted, permissions };
}

export async function serializeTeamScopeOrgPermissions(teamId: string, orgId: string) {
  const granted = await listTeamScopeOrgPermissions(teamId, orgId);
  return { granted, permissions: orgPermissionsSnapshot(granted) };
}

export async function serializeTeamPermissionsForAccount(accountId: string, teamId: string) {
  const granted = await listEffectiveTeamPermissionsForAccount(accountId, teamId);
  const permissions = teamPermissionsSnapshot(granted);
  if (await hasTeamAdminGrant(accountId, teamId)) {
    for (const permission of TEAM_PERMISSIONS) {
      permissions[permission] = true;
    }
  }
  return { granted, permissions };
}

export async function serializeTeamScopePermissions(teamId: string) {
  const granted = await listTeamScopePermissions(teamId);
  return { granted, permissions: teamPermissionsSnapshot(granted) };
}

export async function handleGetOrgMemberPermissions(
  req: Request,
  orgId: string,
  memberUserId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) return jsonResponse({ error: "Organization not found" }, 404);

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "org:read", { type: ResourceType.Organization, id: orgId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const members = await listOrgMembers(db, orgId);
  const member = members.find((row) => row.userId === memberUserId);
  if (member === undefined) return jsonResponse({ error: "Member not found" }, 404);

  return jsonResponse({
    accountId: memberUserId,
    canEdit: await canManageOrgPermissions(user.id, orgId),
    ...(await serializeOrgPermissionsForAccount(memberUserId, orgId)),
  });
}

type PatchPermissionsBody = {
  permissions?: string[];
};

export async function handlePatchOrgMemberPermissions(
  req: Request,
  orgId: string,
  memberUserId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchPermissionsBody;
  try {
    body = (await req.json()) as PatchPermissionsBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const permissions = body.permissions;
  if (permissions === undefined) {
    return jsonResponse({ error: "permissions is required" }, 400);
  }

  const invalid = permissions.filter(
    (permission) => !(ORG_PERMISSIONS as readonly string[]).includes(permission),
  );
  if (invalid.length > 0) {
    return jsonResponse({ error: "Invalid organization permissions" }, 400);
  }

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) return jsonResponse({ error: "Organization not found" }, 404);

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await canManageOrgPermissions(user.id, orgId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const members = await listOrgMembers(db, orgId);
  const member = members.find((row) => row.userId === memberUserId);
  if (member === undefined) return jsonResponse({ error: "Member not found" }, 404);

  await setOrgPermissionsForAccount(memberUserId, orgId, permissions as OrgPermission[]);

  return jsonResponse({
    accountId: memberUserId,
    canEdit: true,
    ...(await serializeOrgPermissionsForAccount(memberUserId, orgId)),
  });
}

export async function handleGetTeamPermissions(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) return jsonResponse({ error: "Team not found" }, 404);

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "team:read", { type: ResourceType.Team, id: teamId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse({
    teamId,
    orgId: team.orgId,
    canEdit: await canManageTeamPermissions(user.id, teamId, team.orgId),
    org: await serializeTeamScopeOrgPermissions(teamId, team.orgId),
    team: await serializeTeamScopePermissions(teamId),
  });
}

type PatchTeamPermissionsBody = PatchPermissionsBody & {
  grantScope?: "org" | "team";
};

export async function handlePatchTeamPermissions(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchTeamPermissionsBody;
  try {
    body = (await req.json()) as PatchTeamPermissionsBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const permissions = body.permissions;
  if (permissions === undefined) {
    return jsonResponse({ error: "permissions is required" }, 400);
  }

  const grantScope = body.grantScope ?? "team";
  if (grantScope !== "org" && grantScope !== "team") {
    return jsonResponse({ error: "Invalid grantScope" }, 400);
  }

  const allowed = grantScope === "org" ? ORG_PERMISSIONS : TEAM_PERMISSIONS;
  const invalid = permissions.filter(
    (permission) => !(allowed as readonly string[]).includes(permission),
  );
  if (invalid.length > 0) {
    return jsonResponse({ error: "Invalid permissions" }, 400);
  }

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) return jsonResponse({ error: "Team not found" }, 404);

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await canManageTeamPermissions(user.id, teamId, team.orgId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (grantScope === "org") {
    await setTeamScopeOrgPermissions(teamId, team.orgId, permissions as OrgPermission[]);
  } else {
    await setTeamScopePermissions(teamId, permissions as TeamPermission[]);
  }

  return jsonResponse({
    teamId,
    orgId: team.orgId,
    canEdit: true,
    org: await serializeTeamScopeOrgPermissions(teamId, team.orgId),
    team: await serializeTeamScopePermissions(teamId),
  });
}

export { getOrgIdForTeam } from "./policy";
