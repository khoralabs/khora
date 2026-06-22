import {
  listAccountRowsForSession,
  listAccountRowsForTeam,
  resolveAccountProfile,
} from "../accounts/resolve-rows";
import { requireRegistrySessionResponse } from "../auth/require-session";
import {
  canManageSession,
  grantSessionCreatorAccess,
  grantSessionParticipant,
  grantTeamSessionParticipant,
  isSessionFacilitator,
  revokeSessionParticipant,
  revokeTeamSessionParticipant,
} from "../authz";
import {
  canContributeToSessionKg,
  canCreateSession,
  canReadSessionKg,
  canReadThread,
  enforce,
  ResourceType,
} from "../authz/policy";
import { loadBeliefFeedback, upsertBeliefFeedback } from "../db/beliefs";
import { getDb } from "../db/index";
import {
  getOrCreateSessionLinkInvite,
  listInvitesForSession,
  mintSessionParticipantInvite,
} from "../db/invites";
import { getOrg, getTeam, listTeamMembers } from "../db/membership";
import { loadThreadMessages } from "../db/messages";
import { formatDaysToDeadline, sessionPhaseFromStatus } from "../db/session-detail";
import {
  createSession,
  getInterviewThreadId,
  getOrCreateInterviewThread,
  getSession,
  listSessionsForUser,
  patchSession,
  sessionRoleForUser,
  setSessionLinkAccess,
  userHasSessionAccess,
} from "../db/sessions";
import { resolveSessionOrgId } from "../documents/accept";
import { getOrCreateUser } from "../identity/users";
import { logger } from "../logger";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";
import { dispatchBeliefIntegration } from "../memories/dispatch-belief-integration";
import { resolveBeliefTextForIntegration } from "../memories/integrate-belief";
import { orgSessionScope, userSessionScope } from "../memories/namespaces";
import { releasePersonalMemoryAccessForParticipant } from "../memories/personal-memory-access";
import { resolveOrgAgentAuthorForOrg, resolveViewerAuthor } from "../messages/resolve-author";
import { serializeThreadMessages } from "../messages/serialize";
import { buildSessionAccess } from "./resolve-access";

type CreateSessionBody = {
  teamId?: string;
  topic?: string;
  deadlineMs?: number;
  memberUserIds?: string[];
  teamIds?: string[];
  createInvite?: boolean;
};

type PatchSessionBody = {
  topic?: string;
  deadlineMs?: number | null;
};

type ManageSessionScopesBody = {
  add?: { accountIds?: string[]; teamIds?: string[] };
  remove?: { accountIds?: string[]; teamIds?: string[] };
};

function uniqueIds(ids: string[] | undefined): string[] {
  if (ids === undefined) return [];
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0))];
}

export async function handleListSessions(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId")?.trim() ?? undefined;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  if (
    teamId !== undefined &&
    teamId.length > 0 &&
    !enforce(db, user.id, "team:member", { type: ResourceType.Team, id: teamId })
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = listSessionsForUser(db, user.id, teamId).map((session) => {
    const team = getTeam(db, session.teamId);
    return {
      ...session,
      orgId: team?.orgId ?? "",
      canReadKg: canReadSessionKg(db, user.id, session.id),
      canContributeKg: canContributeToSessionKg(db, user.id, session.id),
    };
  });
  return Response.json({ sessions });
}

export async function handleCreateSession(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: CreateSessionBody;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const topic = body.topic?.trim() ?? "";
  if (topic.length === 0) {
    return Response.json({ error: "topic is required" }, { status: 400 });
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  const teamId = body.teamId?.trim() ?? "";
  if (teamId.length === 0) {
    return Response.json(
      { error: "teamId is required", onboardingRequired: true },
      { status: 400 },
    );
  }
  if (!canCreateSession(db, user.id, teamId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberUserIds = uniqueIds(body.memberUserIds).filter((id) => id !== user.id);
  const teamIds = uniqueIds(body.teamIds);

  for (const memberId of memberUserIds) {
    if (!enforce(db, memberId, "team:member", { type: ResourceType.Team, id: teamId })) {
      return Response.json({ error: "All members must belong to the team" }, { status: 400 });
    }
  }

  for (const sharedTeamId of teamIds) {
    if (!enforce(db, user.id, "team:member", { type: ResourceType.Team, id: sharedTeamId })) {
      return Response.json({ error: "You must belong to every shared team" }, { status: 403 });
    }
  }

  const session = createSession(db, {
    teamId,
    topic,
    deadlineMs: body.deadlineMs,
  });

  grantSessionCreatorAccess(db, user.id, session.id);

  for (const sharedTeamId of teamIds) {
    grantTeamSessionParticipant(db, sharedTeamId, session.id);
  }

  for (const memberId of memberUserIds) {
    grantSessionParticipant(db, memberId, session.id);
  }

  const bootstrapUserIds = new Set<string>([user.id, ...memberUserIds]);
  for (const sharedTeamId of teamIds) {
    for (const member of listTeamMembers(db, sharedTeamId)) {
      bootstrapUserIds.add(member.userId);
    }
  }

  try {
    bootstrapSessionMemoriesForTeamSession(db, {
      teamId,
      sessionId: session.id,
      userIds: [...bootstrapUserIds],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to bootstrap session memories";
    logger.error({ err: message }, "session memories bootstrap failed");
    return Response.json(
      { error: "Could not set up session memories. Try again." },
      { status: 500 },
    );
  }

  let inviteUrl: string | undefined;
  if (body.createInvite === true) {
    const token = mintSessionParticipantInvite(db, {
      sessionId: session.id,
      teamId,
      createdByUserId: user.id,
    });
    inviteUrl = `/invite/${token}`;
  }

  return Response.json(
    {
      session: {
        ...session,
        role: "facilitator" as const,
      },
      ...(inviteUrl !== undefined ? { inviteUrl } : {}),
    },
    { status: 201 },
  );
}

export async function handleGetSessionById(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!userHasSessionAccess(db, sessionId, user.id) && !canReadSessionKg(db, user.id, sessionId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = listInvitesForSession(db, sessionId);
  const role = sessionRoleForUser(db, sessionId, user.id);
  const phase = sessionPhaseFromStatus(session.status);
  const daysToDeadline = formatDaysToDeadline(session.deadlineMs);
  const participants = listAccountRowsForSession(db, sessionId, user.id);
  const team = getTeam(db, session.teamId);

  return Response.json({
    session: {
      ...session,
      orgId: team?.orgId ?? "",
      role,
      phase,
      daysToDeadline,
      canReadKg: canReadSessionKg(db, user.id, sessionId),
      canContributeKg: canContributeToSessionKg(db, user.id, sessionId),
    },
    participants,
    canManage: canManageSession(db, user.id, sessionId),
    invites,
  });
}

export async function handlePatchSession(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchSessionBody;
  try {
    body = (await req.json()) as PatchSessionBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!canManageSession(db, user.id, sessionId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const topic = body.topic?.trim();
  if (topic !== undefined && topic.length === 0) {
    return Response.json({ error: "topic cannot be empty" }, { status: 400 });
  }

  const updated = patchSession(db, sessionId, {
    topic,
    deadlineMs: body.deadlineMs,
  });
  if (updated === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({
    session: {
      ...updated,
      role: sessionRoleForUser(db, sessionId, user.id),
      phase: sessionPhaseFromStatus(updated.status),
      daysToDeadline: formatDaysToDeadline(updated.deadlineMs),
    },
  });
}

export async function handleManageSessionScopes(
  req: Request,
  sessionId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: ManageSessionScopesBody;
  try {
    body = (await req.json()) as ManageSessionScopesBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!canManageSession(db, user.id, sessionId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const addAccountIds = uniqueIds(body.add?.accountIds);
  const addTeamIds = uniqueIds(body.add?.teamIds);
  const removeAccountIds = uniqueIds(body.remove?.accountIds);
  const removeTeamIds = uniqueIds(body.remove?.teamIds);

  for (const accountId of addAccountIds) {
    if (!enforce(db, accountId, "team:member", { type: ResourceType.Team, id: session.teamId })) {
      return Response.json({ error: "Account must belong to the session team" }, { status: 400 });
    }
    grantSessionParticipant(db, accountId, sessionId);
  }

  for (const sharedTeamId of addTeamIds) {
    if (!enforce(db, user.id, "team:member", { type: ResourceType.Team, id: sharedTeamId })) {
      return Response.json({ error: "You must belong to every shared team" }, { status: 403 });
    }
    grantTeamSessionParticipant(db, sharedTeamId, sessionId);
  }

  for (const accountId of removeAccountIds) {
    if (isSessionFacilitator(db, accountId, sessionId)) {
      return Response.json({ error: "Cannot remove a session facilitator" }, { status: 400 });
    }
    revokeSessionParticipant(db, accountId, sessionId);
    releasePersonalMemoryAccessForParticipant(db, sessionId, accountId);
  }

  for (const sharedTeamId of removeTeamIds) {
    revokeTeamSessionParticipant(db, sharedTeamId, sessionId);
  }

  const participants = listAccountRowsForSession(db, sessionId, user.id);

  return Response.json({ participants });
}

function buildInterviewPayload(
  db: ReturnType<typeof getDb>,
  session: NonNullable<ReturnType<typeof getSession>>,
  threadId: string,
  participantUserId: string,
) {
  const rawMessages = loadThreadMessages(db, threadId);
  const beliefFeedback = loadBeliefFeedback(db, threadId);
  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    throw new Error("Organization not found for session");
  }
  const messages = serializeThreadMessages(db, rawMessages, { org });
  const viewer = resolveViewerAuthor(db, participantUserId);
  const agent = resolveOrgAgentAuthorForOrg(org);

  return {
    session: {
      id: session.id,
      topic: session.topic,
      status: session.status,
      kind: session.kind,
    },
    threadId,
    messages,
    agent,
    viewer,
    beliefFeedback,
    ...(session.kind === "onboarding"
      ? { onboarding: { orgName: org.name, teamName: team.name } }
      : {}),
    ...(session.interviewCompletedAtMs !== null
      ? {
          completion: {
            completedAtMs: session.interviewCompletedAtMs,
            summary: session.interviewSummary ?? "",
            nextSessionOptions: session.nextSessionOptions ?? [],
          },
        }
      : {}),
  };
}

export async function handleGetInterview(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!userHasSessionAccess(db, sessionId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    bootstrapSessionMemoriesForTeamSession(db, {
      teamId: session.teamId,
      sessionId: session.id,
      userIds: [user.id],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to bootstrap session memories";
    logger.error({ err: message }, "interview session memories bootstrap failed");
    return Response.json(
      { error: "Could not set up session memories. Try again." },
      { status: 500 },
    );
  }

  const threadId = getOrCreateInterviewThread(db, { sessionId, userId: user.id });

  try {
    return Response.json({
      ...buildInterviewPayload(db, session, threadId, user.id),
      wsUrl: `/ws/interview/${threadId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load interview";
    logger.error({ err: message }, "interview load failed");
    return Response.json({ error: "Organization not found for session" }, { status: 500 });
  }
}

export async function handleGetParticipantInterview(
  req: Request,
  sessionId: string,
  participantUserId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!canManageSession(db, user.id, sessionId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (participantUserId === user.id) {
    return Response.json(
      { error: "Use the interview endpoint for your own chat" },
      { status: 400 },
    );
  }

  if (!userHasSessionAccess(db, sessionId, participantUserId)) {
    return Response.json({ error: "Participant not found" }, { status: 404 });
  }

  const participant = resolveAccountProfile(db, participantUserId);
  if (participant === null) {
    return Response.json({ error: "Participant not found" }, { status: 404 });
  }

  const threadId = getInterviewThreadId(db, { sessionId, userId: participantUserId });
  if (threadId === null) {
    return Response.json({
      session: {
        id: session.id,
        topic: session.topic,
        status: session.status,
        kind: session.kind,
      },
      threadId: null,
      messages: [],
      agent: null,
      viewer: resolveViewerAuthor(db, participantUserId),
      beliefFeedback: [],
      participant,
      readOnly: true as const,
    });
  }

  if (!canReadThread(db, user.id, threadId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return Response.json({
      ...buildInterviewPayload(db, session, threadId, participantUserId),
      participant,
      readOnly: true as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load interview";
    logger.error({ err: message, participantUserId }, "participant interview load failed");
    return Response.json({ error: "Organization not found for session" }, { status: 500 });
  }
}

type PatchBeliefFeedbackBody = {
  sourceMessageId?: string;
  belief?: string;
  feedback?: "confirmed" | "corrected";
  correction?: string;
};

export async function handlePatchBeliefFeedback(
  req: Request,
  sessionId: string,
  beliefId: string,
): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchBeliefFeedbackBody;
  try {
    body = (await req.json()) as PatchBeliefFeedbackBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const feedback = body.feedback;
  if (feedback !== "confirmed" && feedback !== "corrected") {
    return Response.json({ error: "feedback must be confirmed or corrected" }, { status: 400 });
  }

  const sourceMessageId = body.sourceMessageId?.trim() ?? "";
  if (sourceMessageId.length === 0) {
    return Response.json({ error: "sourceMessageId is required" }, { status: 400 });
  }

  if (feedback === "corrected") {
    const correction = body.correction?.trim() ?? "";
    if (correction.length === 0) {
      return Response.json(
        { error: "correction is required when feedback is corrected" },
        { status: 400 },
      );
    }
  }

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!userHasSessionAccess(db, sessionId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const threadId = getOrCreateInterviewThread(db, { sessionId, userId: user.id });
  const record = upsertBeliefFeedback(db, {
    threadId,
    beliefId,
    sourceMessageId,
    feedback,
    correction: body.correction,
  });

  const beliefText = resolveBeliefTextForIntegration({
    db,
    userId: user.id,
    threadId,
    sessionId,
    beliefId,
    belief: body.belief,
    feedback,
    correction: body.correction,
  });

  const orgId = resolveSessionOrgId(db, session.teamId);
  const namespace = orgSessionScope(orgId, session.teamId, sessionId);
  const personalNamespace = userSessionScope(user.id, orgId, session.teamId, sessionId);

  void dispatchBeliefIntegration({
    userId: user.id,
    sessionId,
    beliefId,
    beliefText,
    feedback,
    orgId,
    teamId: session.teamId,
    namespace,
    personalNamespace,
    ...(body.correction !== undefined ? { correction: body.correction } : {}),
  }).catch((err: unknown) => {
    logger.warn({ err, beliefId }, "belief integration dispatch failed");
  });

  return Response.json({
    beliefFeedback: {
      id: record.id,
      sourceMessageId: record.sourceMessageId,
      feedback: record.feedback,
      correction: record.correction ?? undefined,
    },
  });
}

export async function handleGetSessionAccess(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!userHasSessionAccess(db, sessionId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const canManage = canManageSession(db, user.id, sessionId);
  const access = buildSessionAccess(db, sessionId, user.id, canManage);

  return Response.json(access);
}

type PatchSessionAccessBody = {
  linkAccess?: "restricted" | "anyone";
};

export async function handlePatchSessionAccess(req: Request, sessionId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: PatchSessionAccessBody;
  try {
    body = (await req.json()) as PatchSessionAccessBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!canManageSession(db, user.id, sessionId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.linkAccess !== undefined) {
    if (body.linkAccess !== "restricted" && body.linkAccess !== "anyone") {
      return Response.json({ error: "linkAccess must be restricted or anyone" }, { status: 400 });
    }
    setSessionLinkAccess(db, sessionId, body.linkAccess);
    if (body.linkAccess === "anyone") {
      getOrCreateSessionLinkInvite(db, sessionId, user.id);
    }
  }

  const access = buildSessionAccess(db, sessionId, user.id, true);
  return Response.json(access);
}

export async function handleListTeamMembers(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "team:member", { type: ResourceType.Team, id: teamId })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = listAccountRowsForTeam(db, teamId, user.id);

  return Response.json({ members });
}
