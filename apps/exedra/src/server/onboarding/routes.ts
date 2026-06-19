import type { AccountProfile } from "@shared/accounts/row";

import { resolveAccountProfile } from "../accounts/resolve-rows";
import { requireRegistrySessionResponse } from "../auth/require-session";
import { enforce, ResourceType } from "../authz/policy";
import { buildUserAvatarS3Key } from "../avatars/keys";
import { clearAvatarFromS3, parseAvatarUpload, replaceAvatarInS3 } from "../avatars/upload";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { getDb } from "../db/index";
import {
  getOrg,
  getPendingOnboardingInterview,
  getTeam,
  listTeamsForUser,
  rollbackOnboarding,
  userHasAnyTeam,
  userNeedsOnboardingInterview,
} from "../db/membership";
import { createOrg, createTeam, userHasAnyAccessibleSession } from "../db/sessions";
import { getOrCreateOrgIdentity } from "../identity/orgs";
import {
  type ExedraUser,
  getOrCreateUser,
  updateUserAvatarS3Key,
  updateUserProfile,
} from "../identity/users";
import { bootstrapOrgTeamMemories } from "../memories/bootstrap";
import { resolveTeamProfile } from "../teams/resolve-rows";
import { createOnboardingInterviewForMember } from "./interview";

function serializeMeUser(db: ReturnType<typeof getDb>, user: ExedraUser): AccountProfile {
  return (
    resolveAccountProfile(db, user.id) ?? {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: avatarUrlFromS3Key("user", user.id, user.avatarS3Key),
      jobFunction: user.jobFunction,
    }
  );
}

export async function handleGetMe(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id, auth.session.user.email);
  const teams = listTeamsForUser(db, user.id);
  const pendingOnboarding = getPendingOnboardingInterview(db, user.id);
  const hasTeam = userHasAnyTeam(db, user.id);
  const hasSessionAccessOnly = !hasTeam && userHasAnyAccessibleSession(db, user.id);

  return Response.json({
    user: serializeMeUser(db, user),
    teams: teams.map(resolveTeamProfile),
    onboardingRequired: !hasTeam && !hasSessionAccessOnly,
    onboardingInterviewRequired: userNeedsOnboardingInterview(db, user.id),
    onboardingSessionId: pendingOnboarding?.sessionId ?? null,
    hasSessionAccessOnly,
  });
}

type PatchMeBody = {
  fullName?: string;
  jobFunction?: string;
};

export async function handlePatchMe(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchMeBody;
  try {
    body = (await req.json()) as PatchMeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.fullName === undefined && body.jobFunction === undefined) {
    return Response.json({ error: "fullName or jobFunction is required" }, { status: 400 });
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  const updated = updateUserProfile(db, user.id, {
    fullName: body.fullName,
    jobFunction: body.jobFunction,
  });
  if (updated === null) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({ user: serializeMeUser(db, updated) });
}

export async function handleUploadMeAvatar(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const parsed = await parseAvatarUpload(req);
  if (!parsed.ok) return parsed.response;

  if (parsed.orgId === null) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:member", { type: ResourceType.Organization, id: parsed.orgId })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const s3Key = buildUserAvatarS3Key(parsed.orgId, user.id, parsed.ext);
  try {
    await replaceAvatarInS3({
      previousS3Key: user.avatarS3Key,
      nextS3Key: s3Key,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar upload failed";
    return Response.json({ error: message }, { status: 500 });
  }

  const updated = updateUserAvatarS3Key(db, user.id, s3Key);
  if (updated === null) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({ user: serializeMeUser(db, updated) });
}

export async function handleDeleteMeAvatar(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  try {
    await clearAvatarFromS3(user.avatarS3Key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Avatar delete failed";
    return Response.json({ error: message }, { status: 500 });
  }

  const updated = updateUserAvatarS3Key(db, user.id, null);
  if (updated === null) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({ user: serializeMeUser(db, updated) });
}

type OnboardingBody = {
  orgName?: string;
  teamName?: string;
};

export async function handlePostOnboarding(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgName = body.orgName?.trim() ?? "";
  const teamName = body.teamName?.trim() ?? "";
  if (orgName.length === 0 || teamName.length === 0) {
    return Response.json({ error: "orgName and teamName are required" }, { status: 400 });
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  if (userHasAnyTeam(db, user.id)) {
    return Response.json({ error: "User already belongs to a team" }, { status: 409 });
  }

  const orgId = createOrg(db, { name: orgName, ownerId: user.id });
  await getOrCreateOrgIdentity(db, orgId);
  const teamId = createTeam(db, { orgId, name: teamName, ownerId: user.id });

  let memories: { orgDbPath: string; userDbPath: string };
  try {
    memories = bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  } catch (err) {
    rollbackOnboarding(db, { orgId, teamId });
    const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
    console.error("[exedra] onboarding memories bootstrap failed:", message);
    return Response.json({ error: "Could not set up team memories. Try again." }, { status: 500 });
  }

  const org = getOrg(db, orgId);
  const team = getTeam(db, teamId);
  if (org === null || team === null) {
    return Response.json({ error: "Failed to create org or team" }, { status: 500 });
  }

  let onboardingSessionId: string;
  try {
    const onboarding = createOnboardingInterviewForMember(db, {
      teamId,
      userId: user.id,
      orgName: org.name,
      teamName: team.name,
    });
    onboardingSessionId = onboarding.sessionId;
  } catch (err) {
    rollbackOnboarding(db, { orgId, teamId });
    const message = err instanceof Error ? err.message : "Failed to create onboarding interview";
    console.error("[exedra] onboarding interview setup failed:", message);
    return Response.json(
      { error: "Could not start onboarding interview. Try again." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      org: { id: org.id, name: org.name },
      team: { id: team.id, name: team.name, orgId: team.orgId },
      memories,
      onboardingSessionId,
    },
    { status: 201 },
  );
}
