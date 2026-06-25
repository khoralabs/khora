import { requireRegistrySessionResponse } from "../auth/require-session";
import { canEditTeam, enforce, ResourceType } from "../authz/policy";
import { serializeTeamPermissionsForAccount } from "../authz/routes";
import { buildTeamAvatarS3Key } from "../avatars/keys";
import { clearAvatarFromS3, parseAvatarUpload, replaceAvatarInS3 } from "../avatars/upload";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { getDb } from "../db/index";
import { mintTeamMemberInvite } from "../db/invites";
import {
  getOrg,
  getTeam,
  rollbackTeamCreation,
  type TeamRecord,
  updateTeamAvatarS3Key,
  updateTeamName,
} from "../db/membership";
import { createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { logger } from "../logger";
import { bootstrapOrgTeamMemories } from "../memories/bootstrap";
import { createOnboardingInterviewForMember } from "../onboarding/interview";

type CreateTeamBody = {
  name?: string;
};

export async function handleCreateTeamInOrg(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: CreateTeamBody;
  try {
    body = (await req.json()) as CreateTeamBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  if (name.length === 0) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const org = getOrg(db, orgId);
  if (org === null) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (
    !(await enforce(user.id, "org:team_manage", { type: ResourceType.Organization, id: orgId }))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = await createTeam(db, { orgId, name, ownerId: user.id });

  try {
    await bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  } catch (err) {
    await rollbackTeamCreation(db, teamId);
    const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
    logger.error({ err: message }, "create team memories bootstrap failed");
    return Response.json({ error: "Could not set up team memories. Try again." }, { status: 500 });
  }

  const team = await getTeam(db, teamId);
  if (team === null) {
    return Response.json({ error: "Failed to create team" }, { status: 500 });
  }

  try {
    await createOnboardingInterviewForMember(db, {
      teamId,
      userId: user.id,
      orgName: org.name,
      teamName: team.name,
    });
  } catch (err) {
    await rollbackTeamCreation(db, teamId);
    const message = err instanceof Error ? err.message : "Failed to create onboarding interview";
    logger.error({ err: message }, "create team onboarding interview failed");
    return Response.json(
      { error: "Could not start onboarding interview. Try again." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      team: {
        id: team.id,
        name: team.name,
        orgId: team.orgId,
        orgName: org.name,
        avatarUrl: avatarUrlFromS3Key("team", team.id, team.avatarS3Key),
        orgAvatarUrl: avatarUrlFromS3Key("org", org.id, org.avatarS3Key),
      },
    },
    { status: 201 },
  );
}

export async function handleMintTeamInvite(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  const canMint =
    (await enforce(user.id, "team:member_manage", { type: ResourceType.Team, id: teamId })) ||
    (await enforce(user.id, "org:member_manage", {
      type: ResourceType.Organization,
      id: team.orgId,
    }));
  if (!canMint) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = mintTeamMemberInvite(db, { teamId, createdByUserId: user.id });
  return Response.json({
    token,
    url: `/invite/${token}`,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function serializeTeamSettings(team: TeamRecord, userId: string) {
  return {
    id: team.id,
    name: team.name,
    orgId: team.orgId,
    avatarUrl: avatarUrlFromS3Key("team", team.id, team.avatarS3Key),
    canEdit: await canEditTeam(userId, team.id),
    permissions: (await serializeTeamPermissionsForAccount(userId, team.id)).permissions,
  };
}

export async function handleGetTeamSettings(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "team:read", { type: ResourceType.Team, id: teamId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse(await serializeTeamSettings(team, user.id));
}

type PatchTeamBody = {
  name?: string;
};

export async function handlePatchTeam(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchTeamBody;
  try {
    body = (await req.json()) as PatchTeamBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const name = body.name?.trim() ?? "";
  if (name.length === 0) {
    return jsonResponse({ error: "name is required" }, 400);
  }

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "team:write", { type: ResourceType.Team, id: teamId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const updated = await updateTeamName(db, teamId, name);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(await serializeTeamSettings(updated, user.id));
}

export async function handleUploadTeamAvatar(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "team:write", { type: ResourceType.Team, id: teamId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const parsed = await parseAvatarUpload(req);
  if (!parsed.ok) return parsed.response;

  const s3Key = buildTeamAvatarS3Key(team.orgId, teamId, parsed.ext);
  try {
    await replaceAvatarInS3({
      previousS3Key: team.avatarS3Key,
      nextS3Key: s3Key,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar upload failed";
    return jsonResponse({ error: message }, 500);
  }

  const updated = await updateTeamAvatarS3Key(db, teamId, s3Key);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(await serializeTeamSettings(updated, user.id));
}

export async function handleDeleteTeamAvatar(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = await getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await enforce(user.id, "team:write", { type: ResourceType.Team, id: teamId }))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  try {
    await clearAvatarFromS3(team.avatarS3Key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar delete failed";
    return jsonResponse({ error: message }, 500);
  }

  const updated = await updateTeamAvatarS3Key(db, teamId, null);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(await serializeTeamSettings(updated, user.id));
}
