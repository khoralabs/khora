import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import {
  addTeamMember,
  getOrg,
  getTeam,
  rollbackTeamCreation,
  userBelongsToOrg,
} from "../db/membership";
import { createTeam, isTeamMember } from "../db/sessions";
import { getTeamIdForInvite, getTeamInvitePublicInfo, mintTeamInvite } from "../db/team-invites";
import { getOrCreateUser } from "../identity/users";
import { bootstrapOrgTeamMemories } from "../memories/bootstrap";

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

  return Response.json(
    {
      team: {
        id: team.id,
        name: team.name,
        orgId: team.orgId,
        orgName: org.name,
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

  const team = getTeam(db, teamId);
  if (team !== null) {
    try {
      bootstrapOrgTeamMemories({ orgId: team.orgId, teamId, userId: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
      console.error("[exedra] join team memories bootstrap failed:", message);
    }
  }

  return Response.json({
    teamId,
    redirectTo: "/",
  });
}
