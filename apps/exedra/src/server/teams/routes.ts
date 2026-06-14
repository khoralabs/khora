import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { addTeamMember, getTeam } from "../db/membership";
import { isTeamMember } from "../db/sessions";
import { getTeamIdForInvite, getTeamInvitePublicInfo, mintTeamInvite } from "../db/team-invites";
import { getOrCreateUser } from "../identity/users";

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

  return Response.json({
    teamId,
    redirectTo: "/",
  });
}
