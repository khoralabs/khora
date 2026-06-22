import type {
  AppendInterviewTurnEventsRequest,
  CompleteInterviewTurnRequest,
  FailInterviewTurnRequest,
  InterviewMemorySearchRequest,
  InterviewRagContextRequest,
  InterviewTurnContextWire,
} from "../../../../shared/interview-turn-internal.js";
import type { TurnEventWire } from "../../../../shared/jobs.js";
import { getDb } from "../db/index.js";
import { getOrg, getTeam } from "../db/membership.js";
import { loadThreadMessages } from "../db/messages.js";
import { getSession, getThread } from "../db/sessions.js";
import { failInterviewTurn } from "../interview/fail-interview-turn.js";
import { finalizeInterviewTurn, relayTurnEventsFromWire } from "../interview/finalize-turn.js";
import {
  buildInterviewMemorySearchContext,
  resolveInterviewMemoryContext,
  searchOrgMemoriesForInterview,
  searchPersonalMemoriesForInterview,
} from "../interview/memory-retrieval.js";
import { appendJobEvents, getJob } from "../jobs/db.js";
import { requireInternalToken } from "./require-internal-token.js";

function getTurnSessionContext(turnId: string): {
  threadId: string;
  session: NonNullable<ReturnType<typeof getSession>>;
  thread: NonNullable<ReturnType<typeof getThread>>;
} | null {
  const db = getDb();
  const job = getJob(db, turnId);
  if (job === null || job.kind !== "interview_turn") return null;

  const payload = job.payload as { threadId?: string; sessionId?: string } | null;
  const threadId = payload?.threadId;
  if (threadId === undefined || threadId.length === 0) return null;

  const thread = getThread(db, threadId);
  if (thread === null) return null;

  const session = getSession(db, thread.session_id);
  if (session === null) return null;

  return { threadId, session, thread };
}

export async function handleInternalGetInterviewTurnContext(
  req: Request,
  turnId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const db = getDb();
  const job = getJob(db, turnId);
  if (job === null || job.kind !== "interview_turn") {
    return Response.json({ error: "Turn not found" }, { status: 404 });
  }

  const payload = job.payload as {
    threadId: string;
    displayText: string;
    userTimeZone?: string;
    kickoff?: boolean;
    documentIds?: string[];
  };

  const thread = getThread(db, payload.threadId);
  if (thread?.user_id === null || thread?.user_id === undefined) {
    return Response.json({ error: "Thread user not found" }, { status: 404 });
  }

  const session = getSession(db, thread.session_id);
  if (session === null) return Response.json({ error: "Session not found" }, { status: 404 });

  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const onboardingMeta =
    session.kind === "onboarding" ? { orgName: org.name, teamName: team.name } : undefined;

  const body: InterviewTurnContextWire = {
    threadId: payload.threadId,
    turnId,
    sessionId: session.id,
    sessionKind: session.kind,
    sessionTopic: session.topic,
    sessionInterviewComplete: session.interviewCompletedAtMs !== null,
    userId: thread.user_id,
    orgId: org.id,
    teamId: session.teamId,
    ...(payload.userTimeZone !== undefined ? { userTimeZone: payload.userTimeZone } : {}),
    ...(payload.kickoff === true ? { kickoff: true } : {}),
    displayText: payload.displayText,
    sessionMeta: { topic: session.topic },
    ...(onboardingMeta !== undefined ? { onboardingMeta } : {}),
    history: loadThreadMessages(db, payload.threadId, 50),
    interviewMemoryContext: resolveInterviewMemoryContext(db, {
      orgId: org.id,
      teamId: session.teamId,
      sessionId: session.id,
      participantUserId: thread.user_id,
    }),
    documentIds: payload.documentIds ?? [],
  };

  return Response.json(body);
}

export async function handleInternalInterviewRagContext(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InterviewRagContextRequest;
  try {
    body = (await req.json()) as InterviewRagContextRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const memoryContext = await buildInterviewMemorySearchContext(db, body);
  return Response.json({ memoryContext });
}

export async function handleInternalInterviewSearchOrg(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InterviewMemorySearchRequest;
  try {
    body = (await req.json()) as InterviewMemorySearchRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const hits = await searchOrgMemoriesForInterview(body.context, body.query, body.topK);
  return Response.json({ hits });
}

export async function handleInternalInterviewSearchPersonal(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InterviewMemorySearchRequest;
  try {
    body = (await req.json()) as InterviewMemorySearchRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const hits = await searchPersonalMemoriesForInterview(body.context, body.query, body.topK);
  return Response.json({ hits });
}

export async function handleInternalAppendInterviewTurnEvents(
  req: Request,
  turnId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: AppendInterviewTurnEventsRequest;
  try {
    body = (await req.json()) as AppendInterviewTurnEventsRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: "missing events" }, { status: 400 });
  }

  const ctx = getTurnSessionContext(turnId);
  if (ctx === null) return Response.json({ error: "Turn not found" }, { status: 404 });

  const db = getDb();
  appendJobEvents(
    db,
    turnId,
    body.events.map((event: TurnEventWire) => ({ type: "turn_event", event })),
  );
  relayTurnEventsFromWire(ctx.threadId, turnId, body.events);
  return Response.json({ ok: true });
}

export async function handleInternalCompleteInterviewTurn(
  req: Request,
  turnId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: CompleteInterviewTurnRequest;
  try {
    body = (await req.json()) as CompleteInterviewTurnRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const ctx = getTurnSessionContext(turnId);
  if (ctx === null) return Response.json({ error: "Turn not found" }, { status: 404 });

  const db = getDb();
  const job = getJob(db, turnId);
  const payload = job?.payload as { onboardingMeta?: { orgName: string; teamName: string } } | null;

  finalizeInterviewTurn({
    db,
    threadId: ctx.threadId,
    turnId,
    session: ctx.session,
    assistantId: body.assistantId,
    assistantParts: body.assistantParts,
    beliefFlags: body.beliefFlags,
    sessionCompleted: body.sessionCompleted,
    sessionCompletion: body.sessionCompletion,
    ...(payload?.onboardingMeta !== undefined ? { onboardingMeta: payload.onboardingMeta } : {}),
  });

  return Response.json({ ok: true });
}

export async function handleInternalFailInterviewTurn(
  req: Request,
  turnId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: FailInterviewTurnRequest;
  try {
    body = (await req.json()) as FailInterviewTurnRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const ctx = getTurnSessionContext(turnId);
  if (ctx === null) return Response.json({ error: "Turn not found" }, { status: 404 });

  const db = getDb();
  const job = getJob(db, turnId);
  const payload = job?.payload as { documentIds?: string[] } | null;
  if (ctx.thread.user_id === null || ctx.thread.user_id === undefined) {
    return Response.json({ error: "Thread user not found" }, { status: 404 });
  }

  await failInterviewTurn({
    db,
    turnId,
    threadId: ctx.threadId,
    sessionId: ctx.session.id,
    teamId: ctx.session.teamId,
    userId: ctx.thread.user_id,
    documentIds: payload?.documentIds ?? [],
    error: body.error,
  });

  return Response.json({ ok: true });
}
