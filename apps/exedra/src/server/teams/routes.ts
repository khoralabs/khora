import { requireRegistrySessionResponse } from "../auth/require-session";
import { buildTeamAvatarS3Key } from "../avatars/keys";
import { clearAvatarFromS3, parseAvatarUpload, replaceAvatarInS3 } from "../avatars/upload";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { getDb } from "../db/index";
import {
  addTeamMember,
  getOrg,
  getPendingOnboardingInterview,
  getTeam,
  rollbackTeamCreation,
  updateTeamAvatarS3Key,
  updateTeamName,
  userBelongsToOrg,
} from "../db/membership";
import { createTeam, isTeamMember } from "../db/sessions";
import { getTeamIdForInvite, getTeamInvitePublicInfo, mintTeamInvite } from "../db/team-invites";
import { getOrCreateUser } from "../identity/users";
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
  if (!userBelongsToOrg(db, orgId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = createTeam(db, { orgId, name, ownerId: user.id });

  try {
    bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  } catch (err) {
    rollbackTeamCreation(db, teamId);
    const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
    console.error("[exedra] create team memories bootstrap failed:", message);
    return Response.json({ error: "Could not set up team memories. Try again." }, { status: 500 });
  }

  const team = getTeam(db, teamId);
  if (team === null) {
    return Response.json({ error: "Failed to create team" }, { status: 500 });
  }

  try {
    createOnboardingInterviewForMember(db, {
      teamId,
      userId: user.id,
      orgName: org.name,
      teamName: team.name,
    });
  } catch (err) {
    rollbackTeamCreation(db, teamId);
    const message = err instanceof Error ? err.message : "Failed to create onboarding interview";
    console.error("[exedra] create team onboarding interview failed:", message);
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
  const team = getTeam(db, teamId);
  if (team === null) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!isTeamMember(db, teamId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = mintTeamInvite(db, { teamId, createdByUserId: user.id });
  return Response.json({
    token,
    url: `/join-team/${token}`,
  });
}

export function handleGetJoinTeam(_req: Request, token: string): Response {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const db = getDb();
  const invite = getTeamInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  return Response.json(invite);
}

export async function handleAcceptJoinTeam(req: Request, token: string): Promise<Response> {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const invite = getTeamInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  const teamId = getTeamIdForInvite(db, token);
  if (teamId === null) {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  addTeamMember(db, teamId, user.id);

  let onboardingSessionId: string | null = null;
  const team = getTeam(db, teamId);
  if (team !== null) {
    try {
      bootstrapOrgTeamMemories({ orgId: team.orgId, teamId, userId: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
      console.error("[exedra] join team memories bootstrap failed:", message);
    }

    const org = getOrg(db, team.orgId);
    if (org !== null) {
      try {
        const onboarding = createOnboardingInterviewForMember(db, {
          teamId,
          userId: user.id,
          orgName: org.name,
          teamName: team.name,
        });
        onboardingSessionId = onboarding.sessionId;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create onboarding interview";
        console.error("[exedra] join team onboarding interview failed:", message);
      }
    }
  }

  const pendingOnboarding = getPendingOnboardingInterview(db, user.id);
  const redirectTo =
    pendingOnboarding !== null
      ? `/sessions/${pendingOnboarding.sessionId}/interview`
      : onboardingSessionId !== null
        ? `/sessions/${onboardingSessionId}/interview`
        : "/";

  return Response.json({
    teamId,
    redirectTo,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function serializeTeamSettings(team: NonNullable<ReturnType<typeof getTeam>>, userId: string) {
  return {
    id: team.id,
    name: team.name,
    orgId: team.orgId,
    avatarUrl: avatarUrlFromS3Key("team", team.id, team.avatarS3Key),
    canEdit: team.ownerId === userId,
  };
}

export async function handleGetTeamSettings(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!isTeamMember(db, teamId, user.id)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse(serializeTeamSettings(team, user.id));
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
  const team = getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (team.ownerId !== user.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const updated = updateTeamName(db, teamId, name);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(serializeTeamSettings(updated, user.id));
}

export async function handleUploadTeamAvatar(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (team.ownerId !== user.id) {
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

  const updated = updateTeamAvatarS3Key(db, teamId, s3Key);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(serializeTeamSettings(updated, user.id));
}

export async function handleDeleteTeamAvatar(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const team = getTeam(db, teamId);
  if (team === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (team.ownerId !== user.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  try {
    await clearAvatarFromS3(team.avatarS3Key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar delete failed";
    return jsonResponse({ error: message }, 500);
  }

  const updated = updateTeamAvatarS3Key(db, teamId, null);
  if (updated === null) {
    return jsonResponse({ error: "Team not found" }, 404);
  }

  return jsonResponse(serializeTeamSettings(updated, user.id));
}
