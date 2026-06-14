import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { listInvitesForSession, userAcceptedSessionInvite } from "../db/invites";
import {
  createSession,
  getOrCreateInterviewThread,
  getSession,
  isTeamMember,
} from "../db/sessions";
import { getOrCreateUser } from "../identity/users";

type CreateSessionBody = {
  teamId?: string;
  displayName?: string;
  topic?: string;
  prompt?: string;
  deadlineMs?: number;
};

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

  const session = createSession(db, {
    teamId,
    displayName,
    topic,
    prompt,
    facilitatorId: user.id,
    deadlineMs: body.deadlineMs,
  });

  return Response.json({ session }, { status: 201 });
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
  if (session.facilitatorId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = listInvitesForSession(db, sessionId);
  return Response.json({ session, invites });
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
  if (!userAcceptedSessionInvite(db, sessionId, user.id)) {
    return Response.json({ error: "Invite not accepted" }, { status: 403 });
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
