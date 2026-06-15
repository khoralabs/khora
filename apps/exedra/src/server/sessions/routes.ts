import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { listInvitesForSession } from "../db/invites";
import { listTeamMembers } from "../db/membership";
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

type CreateSessionBody = {
  teamId?: string;
  displayName?: string;
  topic?: string;
  prompt?: string;
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

  const displayName = body.displayName?.trim() ?? "";
  const topic = body.topic?.trim() ?? "";
  const prompt = body.prompt?.trim() ?? "";
  if (displayName.length === 0 || topic.length === 0 || prompt.length === 0) {
    return Response.json({ error: "displayName, topic, and prompt are required" }, { status: 400 });
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
    displayName,
    topic,
    prompt,
    facilitatorId: user.id,
    deadlineMs: body.deadlineMs,
  });

  if (memberUserIds.length > 0) {
    addSessionParticipants(db, session.id, memberUserIds);
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

  const threadId = getOrCreateInterviewThread(db, { sessionId, userId: user.id });
  return Response.json({
    session: {
      id: session.id,
      displayName: session.displayName,
      topic: session.topic,
      prompt: session.prompt,
      status: session.status,
    },
    threadId,
    wsUrl: `/ws/interview/${threadId}`,
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
