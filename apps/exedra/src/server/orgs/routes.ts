import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { buildOrgAvatarS3Key } from "../avatars/keys.js";
import { clearAvatarFromS3, parseAvatarUpload, replaceAvatarInS3 } from "../avatars/upload.js";
import { avatarUrlFromS3Key } from "../avatars/urls.js";
import { getDb } from "../db/index.js";
import {
  getOrg,
  listOrgMembers,
  listTeamsForOrg,
  updateOrgAvatarS3Key,
  updateOrgName,
  userBelongsToOrg,
} from "../db/membership.js";
import { getOrCreateUser } from "../identity/users.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function serializeOrgSettings(org: NonNullable<ReturnType<typeof getOrg>>, userId: string) {
  return {
    id: org.id,
    name: org.name,
    avatarUrl: avatarUrlFromS3Key("org", org.id, org.avatarS3Key),
    canEdit: org.ownerId === userId,
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
  if (!userBelongsToOrg(db, orgId, user.id)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const members = listOrgMembers(db, orgId).map((member) => ({
    ...member,
    isCurrentUser: member.userId === user.id,
    isOwner: member.userId === org.ownerId,
  }));

  return jsonResponse({ members });
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
  if (!userBelongsToOrg(db, orgId, user.id)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse({ teams: listTeamsForOrg(db, orgId) });
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
  if (!userBelongsToOrg(db, orgId, user.id)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse(serializeOrgSettings(org, user.id));
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
  if (org.ownerId !== user.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const updated = updateOrgName(db, orgId, name);
  if (updated === null) {
    return jsonResponse({ error: "Organization not found" }, 404);
  }

  return jsonResponse(serializeOrgSettings(updated, user.id));
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
  if (org.ownerId !== user.id) {
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

  return jsonResponse(serializeOrgSettings(updated, user.id));
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
  if (org.ownerId !== user.id) {
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

  return jsonResponse(serializeOrgSettings(updated, user.id));
}
