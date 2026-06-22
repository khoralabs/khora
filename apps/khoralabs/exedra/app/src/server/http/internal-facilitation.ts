import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import type {
  AppendFacilitationMessageRequest,
  FacilitationParticipantContextWire,
} from "../../../shared/facilitation-internal.js";
import { resolveAccountProfile } from "../accounts/resolve-rows.js";
import { getDb } from "../db/index.js";
import { getOrg, getTeam } from "../db/membership.js";
import { loadThreadMessages } from "../db/messages.js";
import { getInterviewThreadId, getSession, getThread } from "../db/sessions.js";
import {
  appendFacilitationAssistantMessage,
  resolveFacilitationThreadId,
} from "../facilitation/messages.js";
import { getJob, setJobStatus } from "../jobs/db.js";
import { serializeThreadMessages } from "../messages/serialize.js";
import { requireInternalToken } from "./require-internal-token.js";

function collectBeliefs(messages: UIMessage[]): string[] {
  const beliefs: string[] = [];
  for (const message of messages) {
    const metadata = message.metadata as
      | { beliefFlags?: { belief: string; messageId: string }[] }
      | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      const trimmed = flag.belief.trim();
      if (trimmed.length > 0) beliefs.push(trimmed);
    }
  }
  return beliefs;
}

export function buildFacilitationParticipantContext(
  db: Database,
  sessionId: string,
  participantUserId: string,
): FacilitationParticipantContextWire | null {
  const session = getSession(db, sessionId);
  if (session === null) return null;

  const threadId = getInterviewThreadId(db, { sessionId, userId: participantUserId });
  if (threadId === null) return null;

  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) return null;

  const rawMessages = loadThreadMessages(db, threadId);
  const messages = serializeThreadMessages(db, rawMessages, { org });
  const profile = resolveAccountProfile(db, participantUserId);
  const participantName = profile?.fullName?.trim() || profile?.email?.trim() || "Participant";

  return {
    sessionId,
    sessionTopic: session.topic,
    participantUserId,
    participantName,
    threadId,
    messages,
    beliefs: collectBeliefs(messages),
  };
}

export async function handleInternalGetFacilitationThread(
  req: Request,
  sessionId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const db = getDb();
  const threadId = resolveFacilitationThreadId(db, sessionId);
  return Response.json({ threadId });
}

export async function handleInternalGetFacilitationParticipantContext(
  req: Request,
  sessionId: string,
  participantUserId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const db = getDb();
  const context = buildFacilitationParticipantContext(db, sessionId, participantUserId);
  if (context === null) {
    return Response.json({ error: "Context not found" }, { status: 404 });
  }
  return Response.json(context);
}

export async function handleInternalAppendFacilitationMessage(
  req: Request,
  facilitationThreadId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: AppendFacilitationMessageRequest;
  try {
    body = (await req.json()) as AppendFacilitationMessageRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const thread = getThread(db, facilitationThreadId);
  if (thread === null || thread.kind !== "facilitation") {
    return Response.json({ error: "Facilitation thread not found" }, { status: 404 });
  }

  appendFacilitationAssistantMessage(db, {
    facilitationThreadId,
    assistantId: body.assistantId,
    parts: body.parts,
  });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (jobId !== null && jobId.length > 0) {
    const job = getJob(db, jobId);
    if (job !== null && job.kind === "facilitation_event") {
      setJobStatus(db, jobId, "done");
    }
  }

  return Response.json({ ok: true });
}
