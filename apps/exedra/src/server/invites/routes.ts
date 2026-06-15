import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import {
  consumeSessionInvite,
  getInvitePublicInfo,
  listInvitesForSession,
  mintSessionInvite,
} from "../db/invites";
import { addSessionParticipants, getSession } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { getRegistryUrl } from "../registry-url";

export type InvitePublicInfo = {
  token: string;
  displayName: string;
  topic: string;
  status: "pending" | "accepted" | "expired";
};

/** Public metadata for an invite deep link (no auth required). */
export function handleGetInvite(_req: Request, token: string): Response {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const db = getDb();
  const invite = getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  return Response.json(invite satisfies InvitePublicInfo);
}

/** Accept an invite after registry OTP auth. */
export async function handleAcceptInvite(req: Request, token: string): Promise<Response> {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const session = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const invite = getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  const user = await getOrCreateUser(db, session.user.id);
  const consumed = consumeSessionInvite(db, token, user.id);
  if (consumed === null) {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  addSessionParticipants(db, consumed.sessionId, [user.id]);

  return Response.json({
    invite,
    userId: user.id,
    redirectTo: "/",
  });
}

/** Mint a single-use invite for a session (facilitator). */
export async function handleMintInvite(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const sessionRecord = getSession(db, sessionId);
  if (sessionRecord === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (sessionRecord.facilitatorId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = mintSessionInvite(db, sessionId);
  const invites = listInvitesForSession(db, sessionId);

  return Response.json({
    token,
    url: `/invite/${token}`,
    inviteCount: invites.length,
  });
}
