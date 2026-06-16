import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { listInvitesForSession } from "../db/invites";
import {
  getOrg,
  getTeam,
  listTeamMembers,
  userNeedsOnboardingInterviewForTeam,
} from "../db/membership";
import { loadThreadMessages } from "../db/messages";
import {
  formatDaysToDeadline,
  listSessionParticipantDetails,
  sessionPhaseFromStatus,
} from "../db/session-detail";
import {
  addSessionParticipants,
  createSession,
  getOrCreateInterviewThread,
  getSession,
  isTeamMember,
  listSessionsForUser,
  userHasSessionAccess,
} from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";

type CreateSessionBody = {
  teamId?: string;
  topic?: string;
  deadlineMs?: number;
  memberUserIds?: string[];
};

export async function handleListSessions(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId")?.trim() ?? undefined;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  if (teamId !== undefined && teamId.length > 0 && !isTeamMember(db, teamId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = listSessionsForUser(db, user.id, teamId);
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
  if (!isTeamMember(db, teamId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (userNeedsOnboardingInterviewForTeam(db, teamId, user.id)) {
    return Response.json(
      {
        error: "Complete your onboarding interview before creating sessions",
        onboardingInterviewRequired: true,
      },
      { status: 403 },
    );
  }

  const memberUserIds = (body.memberUserIds ?? []).filter(
    (id) => typeof id === "string" && id.trim().length > 0 && id !== user.id,
  );

  for (const memberId of memberUserIds) {
    if (!isTeamMember(db, teamId, memberId)) {
      return Response.json({ error: "All members must belong to the team" }, { status: 400 });
    }
  }

  const session = createSession(db, {
    teamId,
    topic,
    facilitatorId: user.id,
    deadlineMs: body.deadlineMs,
  });

  if (memberUserIds.length > 0) {
    addSessionParticipants(db, session.id, memberUserIds);
  }

  try {
    bootstrapSessionMemoriesForTeamSession(db, {
      teamId,
      sessionId: session.id,
      userIds: [user.id, ...memberUserIds],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to bootstrap session memories";
    console.error("[exedra] session memories bootstrap failed:", message);
    return Response.json(
      { error: "Could not set up session memories. Try again." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      session: {
        ...session,
        role: "facilitator" as const,
      },
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
  if (!userHasSessionAccess(db, sessionId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = listInvitesForSession(db, sessionId);
  const role = session.facilitatorId === user.id ? "facilitator" : "participant";
  const phase = sessionPhaseFromStatus(session.status);
  const daysToDeadline = formatDaysToDeadline(session.deadlineMs);
  const participants = listSessionParticipantDetails(db, sessionId, session.facilitatorId).map(
    (participant) => ({
      ...participant,
      isCurrentUser: participant.userId === user.id,
    }),
  );

  return Response.json({
    session: {
      ...session,
      role,
      phase,
      daysToDeadline,
    },
    participants,
    canManage: session.facilitatorId === user.id,
    invites,
  });
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
    console.error("[exedra] interview session memories bootstrap failed:", message);
    return Response.json(
      { error: "Could not set up session memories. Try again." },
      { status: 500 },
    );
  }

  const threadId = getOrCreateInterviewThread(db, { sessionId, userId: user.id });
  const messages = loadThreadMessages(db, threadId);
  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  return Response.json({
    session: {
      id: session.id,
      topic: session.topic,
      status: session.status,
      kind: session.kind,
    },
    threadId,
    wsUrl: `/ws/interview/${threadId}`,
    messages,
    ...(session.kind === "onboarding" && team !== null && org !== null
      ? { onboarding: { orgName: org.name, teamName: team.name } }
      : {}),
  });
}

export async function handleListTeamMembers(req: Request, teamId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!isTeamMember(db, teamId, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = listTeamMembers(db, teamId).map((member) => ({
    ...member,
    isCurrentUser: member.userId === user.id,
  }));

  return Response.json({ members });
}
