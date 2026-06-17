import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import {
  consumeSessionInvite,
  getInvitePublicInfo,
  getInviteSessionId,
  listInvitesForSession,
  mintSessionInvite,
} from "../db/invites";
import { addSessionParticipants, getSession, userHasSessionAccess } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";
import { getRegistryUrl } from "../registry-url";

export type InvitePublicInfo = {
  token: string;
  topic: string;
  status: "pending" | "accepted" | "expired";
  sessionId?: string;
  alreadyJoined?: boolean;
  redirectTo?: string;
};

function sessionInviteRedirect(sessionId: string): string {
  return `/sessions/${sessionId}/interview`;
}

/** Public metadata for an invite deep link (no auth required). */
export async function handleGetInvite(req: Request, token: string): Promise<Response> {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const db = getDb();
  const invite = getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  const sessionId = getInviteSessionId(db, token);
  const payload: InvitePublicInfo = sessionId === null ? invite : { ...invite, sessionId };

  const authSession = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (authSession !== null && sessionId !== null) {
    const user = await getOrCreateUser(db, authSession.user.id);
    if (userHasSessionAccess(db, sessionId, user.id)) {
      payload.alreadyJoined = true;
      payload.redirectTo = sessionInviteRedirect(sessionId);
    }
  }

  return Response.json(payload satisfies InvitePublicInfo);
}

/** Accept an invite after registry OTP auth. */
export async function handleAcceptInvite(req: Request, token: string): Promise<Response> {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const authSession = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (authSession === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const invite = getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, authSession.user.id);
  const sessionId = getInviteSessionId(db, token);
  if (sessionId !== null && userHasSessionAccess(db, sessionId, user.id)) {
    return Response.json({
      invite,
      userId: user.id,
      alreadyJoined: true,
      redirectTo: sessionInviteRedirect(sessionId),
    });
  }

  if (invite.status !== "pending") {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  const consumed = consumeSessionInvite(db, token, user.id);
  if (consumed === null) {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  addSessionParticipants(db, consumed.sessionId, [user.id]);

  const sessionRecord = getSession(db, consumed.sessionId);
  if (sessionRecord !== null) {
    try {
      bootstrapSessionMemoriesForTeamSession(db, {
        teamId: sessionRecord.teamId,
        sessionId: sessionRecord.id,
        userIds: [user.id],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to bootstrap session memories";
      console.error("[exedra] invite session memories bootstrap failed:", message);
      return Response.json(
        { error: "Could not set up session memories. Try again." },
        { status: 500 },
      );
    }
  }

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
