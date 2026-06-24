import { verifyRegistrySession } from "@khoralabs/registry-auth";
import { inviteKind, sessionIdFromEffects, teamIdFromEffects } from "@shared/invites/effects";

import { requireRegistrySessionResponse } from "../auth/require-session";
import { canManageSession } from "../authz";
import { grantSessionFacilitation, hasFacilitationAccess } from "../authz/policy";
import { dispatchInitialInterviewResponseForParticipant } from "../chat/initial-interview-response";
import { ensureFacilitationChatThread } from "../chat/session-chat";
import { getDb } from "../db/index";
import {
  consumeInvite,
  getInvitePublicInfo,
  getInviteTeamId,
  listInvitesForSession,
  mintSessionParticipantInvite,
} from "../db/invites";
import {
  getOrg,
  getPendingOnboardingInterview,
  getTeam,
  isTeamMember,
  setTeamMemberOnboardingSession,
} from "../db/membership";
import {
  getActiveOnboardingSessionForTeam,
  getSession,
  getSessionLinkAccess,
  getSessionLinkGrantRole,
  syncFacilitationThreadGrants,
  userHasSessionAccess,
} from "../db/sessions";
import { getOrCreateUser, setUserSessionConsentAccepted } from "../identity/users";
import { logger } from "../logger";
import { bootstrapOrgTeamMemories } from "../memories/bootstrap";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";
import { grantPersonalMemoryAccessForSession } from "../memories/personal-memory-access";
import { createOnboardingInterviewForMember } from "../onboarding/interview";
import { getRegistryUrl } from "../registry-url";
import { applyInviteEffects } from "./apply-effects";

type AcceptInviteBody = {
  personalMemoryConsent?: boolean;
};

export type InvitePublicInfo = {
  token: string;
  kind: "team" | "session";
  status: "pending" | "accepted";
  reusable: boolean;
  teamName?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  topic?: string;
  sessionId?: string;
  alreadyJoined?: boolean;
  redirectTo?: string;
};

function sessionInviteRedirect(sessionId: string): string {
  return `/sessions/${sessionId}/interview`;
}

function teamInviteRedirect(params: {
  pendingOnboardingSessionId: string | null;
  onboardingSessionId: string | null;
}): string {
  if (params.pendingOnboardingSessionId !== null) {
    return `/sessions/${params.pendingOnboardingSessionId}/interview`;
  }
  if (params.onboardingSessionId !== null) {
    return `/sessions/${params.onboardingSessionId}/interview`;
  }
  return "/";
}

/** Public metadata for an invite deep link (no auth required). */
export async function handleGetInvite(req: Request, token: string): Promise<Response> {
  if (token.length === 0) {
    return Response.json({ error: "Invite token required" }, { status: 400 });
  }

  const db = getDb();
  const invite = await getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  const payload: InvitePublicInfo = { ...invite };

  const authSession = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (authSession !== null) {
    const user = await getOrCreateUser(db, authSession.user.id);
    if (invite.kind === "session" && invite.sessionId !== undefined) {
      if (await userHasSessionAccess(db, invite.sessionId, user.id)) {
        payload.alreadyJoined = true;
        payload.redirectTo = sessionInviteRedirect(invite.sessionId);
      } else if (await hasFacilitationAccess(user.id, invite.sessionId)) {
        payload.alreadyJoined = true;
        payload.redirectTo = sessionInviteRedirect(invite.sessionId);
      }
    } else if (invite.kind === "team") {
      const teamId = getInviteTeamId(db, token);
      if (teamId !== null && (await isTeamMember(db, teamId, user.id))) {
        payload.alreadyJoined = true;
        payload.redirectTo = "/";
      }
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
  const invite = await getInvitePublicInfo(db, token);
  if (invite === null) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, authSession.user.id);

  if (invite.kind === "session" && invite.sessionId !== undefined) {
    if (await userHasSessionAccess(db, invite.sessionId, user.id)) {
      return Response.json({
        invite,
        userId: user.id,
        alreadyJoined: true,
        redirectTo: sessionInviteRedirect(invite.sessionId),
      });
    }
    if (await hasFacilitationAccess(user.id, invite.sessionId)) {
      return Response.json({
        invite,
        userId: user.id,
        alreadyJoined: true,
        redirectTo: sessionInviteRedirect(invite.sessionId),
      });
    }
  } else if (invite.kind === "team") {
    const teamId = getInviteTeamId(db, token);
    if (teamId !== null && (await isTeamMember(db, teamId, user.id))) {
      return Response.json({
        invite,
        userId: user.id,
        alreadyJoined: true,
        redirectTo: "/",
      });
    }
  }

  if (!invite.reusable && invite.status !== "pending") {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  // For reusable share links, verify that link sharing is still enabled for the session.
  if (invite.reusable && invite.sessionId !== undefined) {
    const linkAccess = getSessionLinkAccess(db, invite.sessionId);
    if (linkAccess !== "anyone") {
      return Response.json({ error: "Link sharing is off for this session" }, { status: 409 });
    }
  }

  if (invite.kind === "session") {
    const linkGrantRole =
      invite.reusable && invite.sessionId !== undefined
        ? getSessionLinkGrantRole(db, invite.sessionId)
        : "participant";
    if (linkGrantRole !== "facilitation") {
      let body: AcceptInviteBody = {};
      try {
        body = (await req.json()) as AcceptInviteBody;
      } catch {
        body = {};
      }
      if (body.personalMemoryConsent !== true) {
        return Response.json(
          { error: "Personal memory consent is required to join this session" },
          { status: 400 },
        );
      }
    }
  }

  const effects = consumeInvite(db, token, user.id);
  if (effects === null) {
    return Response.json({ error: "Invite is no longer available" }, { status: 409 });
  }

  const kind = inviteKind(effects);

  if (
    invite.reusable &&
    invite.sessionId !== undefined &&
    getSessionLinkGrantRole(db, invite.sessionId) === "facilitation"
  ) {
    await grantSessionFacilitation(user.id, invite.sessionId);
    await ensureFacilitationChatThread({ db, sessionId: invite.sessionId });
    await syncFacilitationThreadGrants(db, invite.sessionId);
    return Response.json({
      invite,
      userId: user.id,
      redirectTo: sessionInviteRedirect(invite.sessionId),
    });
  }

  await applyInviteEffects(db, user.id, effects);

  if (kind === "session") {
    setUserSessionConsentAccepted(db, user.id);
    const sessionId = sessionIdFromEffects(effects);
    if (sessionId === null) {
      return Response.json({ error: "Invalid invite" }, { status: 500 });
    }

    const sessionRecord = getSession(db, sessionId);
    if (sessionRecord !== null) {
      const team = await getTeam(db, sessionRecord.teamId);
      if (team !== null) {
        await grantPersonalMemoryAccessForSession(db, {
          orgId: team.orgId,
          sessionId: sessionRecord.id,
          userId: user.id,
        });

        try {
          bootstrapOrgTeamMemories({
            orgId: team.orgId,
            teamId: sessionRecord.teamId,
            userId: user.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
          logger.error({ err: message }, "invite session org memories bootstrap failed");
        }
      }

      try {
        await bootstrapSessionMemoriesForTeamSession(db, {
          teamId: sessionRecord.teamId,
          sessionId: sessionRecord.id,
          userIds: [user.id],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to bootstrap session memories";
        logger.error({ err: message }, "invite session memories bootstrap failed");
        return Response.json(
          { error: "Could not set up session memories. Try again." },
          { status: 500 },
        );
      }

      if (sessionRecord.kind === "onboarding") {
        setTeamMemberOnboardingSession(db, {
          teamId: sessionRecord.teamId,
          userId: user.id,
          sessionId: sessionRecord.id,
        });
      }

      await dispatchInitialInterviewResponseForParticipant(db, sessionRecord.id, user.id);
    }

    return Response.json({
      invite,
      userId: user.id,
      redirectTo: sessionInviteRedirect(sessionId),
    });
  }

  if (kind === "team") {
    const teamId = teamIdFromEffects(effects);
    if (teamId === null) {
      return Response.json({ error: "Invalid invite" }, { status: 500 });
    }

    let onboardingSessionId: string | null = null;
    const team = await getTeam(db, teamId);
    if (team !== null) {
      try {
        bootstrapOrgTeamMemories({ orgId: team.orgId, teamId, userId: user.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
        logger.error({ err: message }, "invite team memories bootstrap failed");
      }

      const org = getOrg(db, team.orgId);
      // Only create a personal onboarding session if the team has no active one already.
      // If an intake session is already in progress, the new member should either be
      // explicitly added to it (and see it in the sidebar) or create their own standard session.
      const existingOnboardingSessionId = getActiveOnboardingSessionForTeam(db, teamId);
      if (org !== null && existingOnboardingSessionId === null) {
        try {
          const onboarding = await createOnboardingInterviewForMember(db, {
            teamId,
            userId: user.id,
            orgName: org.name,
            teamName: team.name,
          });
          onboardingSessionId = onboarding.sessionId;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to create onboarding interview";
          logger.error({ err: message }, "invite team onboarding interview failed");
        }
      }
    }

    const pendingOnboarding = getPendingOnboardingInterview(db, user.id);
    return Response.json({
      invite,
      userId: user.id,
      teamId,
      redirectTo: teamInviteRedirect({
        pendingOnboardingSessionId: pendingOnboarding?.sessionId ?? null,
        onboardingSessionId,
      }),
    });
  }

  return Response.json({ error: "Invalid invite" }, { status: 500 });
}

/** Mint a single-use invite for a session. */
export async function handleMintInvite(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const sessionRecord = getSession(db, sessionId);
  if (sessionRecord === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!(await canManageSession(user.id, sessionId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = mintSessionParticipantInvite(db, {
    sessionId,
    teamId: sessionRecord.teamId,
    createdByUserId: user.id,
  });
  const invites = listInvitesForSession(db, sessionId);

  return Response.json({
    token,
    url: `/invite/${token}`,
    inviteCount: invites.length,
  });
}
