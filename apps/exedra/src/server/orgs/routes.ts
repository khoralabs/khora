import { listAccountRowsForOrg } from "../accounts/resolve-rows.js";
import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { canEditOrg, enforce, hasOrgAdminGrant, ResourceType } from "../authz/policy.js";
import { serializeOrgPermissionsForAccount } from "../authz/routes.js";
import { buildOrgAvatarS3Key } from "../avatars/keys.js";
import { clearAvatarFromS3, parseAvatarUpload, replaceAvatarInS3 } from "../avatars/upload.js";
import { avatarUrlFromS3Key } from "../avatars/urls.js";
import { getDb } from "../db/index.js";
import { getOrg, listOrgMembers, updateOrgAvatarS3Key, updateOrgName } from "../db/membership.js";
import { getKhoraHostUrl } from "../env.js";
import { getOrCreateOrgIdentity } from "../identity/orgs.js";
import { findUserById, getOrCreateUser } from "../identity/users.js";
import { listTeamRowsForOrg } from "../teams/resolve-rows.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function serializeOrgSettings(
  org: NonNullable<ReturnType<typeof getOrg>>,
  userId: string,
  db: ReturnType<typeof getDb>,
  did: string | null,
) {
  return {
    id: org.id,
    name: org.name,
    avatarUrl: avatarUrlFromS3Key("org", org.id, org.avatarS3Key),
    did,
    canEdit: canEditOrg(db, userId, org.id),
    permissions: serializeOrgPermissionsForAccount(db, userId, org.id).permissions,
    networkOptedInAtMs: org.networkOptedInAtMs,
    networkJoinAvailable: getKhoraHostUrl() !== null,
  };
}

export async function handleListOrgMembers(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:read", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const members = listAccountRowsForOrg(db, orgId, user.id);

  return jsonResponse({ members });
}

export async function handleGetOrgMember(
  req: Request,
  orgId: string,
  memberUserId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:read", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const member = listOrgMembers(db, orgId).find((row) => row.userId === memberUserId);
  if (member === null || member === undefined) {
    return jsonResponse({ error: "Member not found" }, 404);
  }

  const profile = findUserById(db, memberUserId);
  if (profile === null) {
    return jsonResponse({ error: "Member not found" }, 404);
  }

  return jsonResponse({
    user: {
      userId: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      jobFunction: profile.jobFunction,
      avatarUrl: avatarUrlFromS3Key("user", profile.id, profile.avatarS3Key),
    },
    isCurrentUser: memberUserId === user.id,
    isAdmin: hasOrgAdminGrant(db, memberUserId, orgId),
    teamIds: member.teamIds,
    teamNames: member.teamNames,
  });
}

export async function handleListOrgTeams(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:read", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse({ teams: listTeamRowsForOrg(db, orgId) });
}

async function buildOrgSettingsResponse(
  db: ReturnType<typeof getDb>,
  org: NonNullable<ReturnType<typeof getOrg>>,
  userId: string,
): Promise<ReturnType<typeof serializeOrgSettings>> {
  const { did } = await getOrCreateOrgIdentity(db, org.id);
  return serializeOrgSettings(org, userId, db, did);
}

export async function handleGetOrgSettings(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:read", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse(await buildOrgSettingsResponse(db, org, user.id));
}

type PatchOrgBody = {
  name?: string;
};

export async function handlePatchOrg(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchOrgBody;
  try {
    body = (await req.json()) as PatchOrgBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const name = body.name?.trim() ?? "";
  if (name.length === 0) {
    return jsonResponse({ error: "name is required" }, 400);
  }

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:write", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const updated = updateOrgName(db, orgId, name);
  if (updated === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  return jsonResponse(await buildOrgSettingsResponse(db, updated, user.id));
}

export async function handleUploadOrgAvatar(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:write", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const parsed = await parseAvatarUpload(req);
  if (!parsed.ok) return parsed.response;

  const s3Key = buildOrgAvatarS3Key(orgId, parsed.ext);
  try {
    await replaceAvatarInS3({
      previousS3Key: org.avatarS3Key,
      nextS3Key: s3Key,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar upload failed";
    return jsonResponse({ error: message }, 500);
  }

  const updated = updateOrgAvatarS3Key(db, orgId, s3Key);
  if (updated === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  return jsonResponse(await buildOrgSettingsResponse(db, updated, user.id));
}

export async function handleDeleteOrgAvatar(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:write", { type: ResourceType.Organization, id: orgId })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  try {
    await clearAvatarFromS3(org.avatarS3Key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar delete failed";
    return jsonResponse({ error: message }, 500);
  }

  const updated = updateOrgAvatarS3Key(db, orgId, null);
  if (updated === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  return jsonResponse(await buildOrgSettingsResponse(db, updated, user.id));
}
