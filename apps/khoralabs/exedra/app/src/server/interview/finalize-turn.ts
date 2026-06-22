import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import type { TurnEventWire } from "../../../../shared/jobs.js";
import type { SessionCompletionPayload } from "../../agents/interview/session-closing.js";
import { getOrg, getTeam } from "../db/membership.js";
import { insertMessage, nextMessageIndex } from "../db/messages.js";
import { getThread, markSessionInterviewComplete, type SessionRecord } from "../db/sessions.js";
import { appendJobEvents, getJob, setJobStatus } from "../jobs/db.js";
import { logger } from "../logger.js";
import { releasePersonalMemoryAccessForSession } from "../memories/personal-memory-access.js";
import { resolveOrgAgentAuthorForOrg } from "../messages/resolve-author.js";
import { applyOnboardingCompletionSideEffects } from "../onboarding/interview.js";
import type { TurnEvent } from "./turn-engine/events.js";
import { relayTurnEvent } from "./turn-relay.js";

export function finalizeInterviewTurn(args: {
  db: Database;
  threadId: string;
  turnId: string;
  session: SessionRecord;
  assistantId: string;
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
  sessionCompleted: boolean;
  sessionCompletion: SessionCompletionPayload | null;
  onboardingMeta?: { orgName: string; teamName: string };
  emit?: (event: TurnEvent) => void;
}): { assistantCreatedAtMs: number; events: TurnEvent[] } {
  const {
    db,
    threadId,
    turnId,
    session,
    assistantId,
    assistantParts,
    beliefFlags,
    sessionCompleted,
    sessionCompletion,
    onboardingMeta,
  } = args;

  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    throw new Error("Organization not found for session");
  }

  const thread = getThread(db, threadId);
  const assistantIndex = nextMessageIndex(db, threadId);
  const assistantCreatedAtMs = insertMessage(db, {
    id: assistantId,
    threadId,
    role: "assistant",
    parts: assistantParts.length > 0 ? assistantParts : [{ type: "text", text: "" }],
    messageIndex: assistantIndex,
    metadata: beliefFlags.length > 0 ? { beliefFlags } : undefined,
    authorDid: org.id,
  });

  const agentAuthor = resolveOrgAgentAuthorForOrg(org);
  const events: TurnEvent[] = [];

  if (sessionCompletion !== null) {
    markSessionInterviewComplete(db, session.id, sessionCompletion);
    releasePersonalMemoryAccessForSession(db, session.id);

    if (onboardingMeta !== undefined && thread?.user_id != null) {
      try {
        applyOnboardingCompletionSideEffects({
          db,
          threadId,
          teamId: session.teamId,
          userId: thread.user_id,
          summary: sessionCompletion.summary,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Onboarding completion failed";
        logger.error(
          { err: message, sessionId: session.id },
          "onboarding completion side effects failed",
        );
      }
    }

    events.push({
      type: "session_complete",
      completion: {
        summary: sessionCompletion.summary,
        nextSessionOptions: sessionCompletion.nextSessionOptions,
        sessionKind: session.kind,
      },
    });
  }

  events.push({
    type: "assistant_message",
    message: {
      id: assistantId,
      role: "assistant",
      parts: assistantParts,
      ...(beliefFlags.length > 0 ? { metadata: { beliefFlags } } : {}),
    },
    createdAtMs: assistantCreatedAtMs,
    author: agentAuthor,
    ...(sessionCompleted ? { sessionCompleted: true } : {}),
  });

  const emit = args.emit ?? ((event) => relayTurnEvent(threadId, event));
  for (const event of events) {
    emit(event);
  }

  const job = getJob(db, turnId);
  if (job !== null) {
    appendJobEvents(
      db,
      turnId,
      events.map((event) => ({ type: "turn_event", event: turnEventToWire(event) })),
    );
    setJobStatus(db, turnId, "done");
  }

  return { assistantCreatedAtMs, events };
}

function turnEventToWire(event: TurnEvent): TurnEventWire {
  switch (event.type) {
    case "text_delta":
      return { type: "text_delta", turnId: event.turnId, delta: event.delta };
    case "tool_call":
      return {
        type: "tool_call",
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        output: event.output,
      };
    case "tool_error":
      return {
        type: "tool_error",
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        errorText: event.errorText,
      };
    case "belief_flag":
      return {
        type: "belief_flag",
        turnId: event.turnId,
        belief: event.belief,
        sourceMessageId: event.sourceMessageId,
      };
    case "turn_aborted":
      return { type: "turn_aborted", turnId: event.turnId };
    case "turn_failed":
      return { type: "turn_failed", turnId: event.turnId, error: event.error };
    case "error":
      return { type: "error", error: event.error };
    default:
      return { type: "error", error: "Unsupported turn event" };
  }
}

export function relayTurnEventsFromWire(
  threadId: string,
  turnId: string,
  events: TurnEventWire[],
): void {
  for (const wire of events) {
    relayTurnEvent(threadId, turnWireToEvent(turnId, wire));
  }
}

export function turnWireToEvent(fallbackTurnId: string, wire: TurnEventWire): TurnEvent {
  const turnId = "turnId" in wire ? wire.turnId : fallbackTurnId;
  switch (wire.type) {
    case "text_delta":
      return { type: "text_delta", turnId, delta: wire.delta };
    case "tool_call":
      return {
        type: "tool_call",
        turnId,
        toolCallId: wire.toolCallId,
        toolName: wire.toolName,
        input: wire.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        turnId,
        toolCallId: wire.toolCallId,
        toolName: wire.toolName,
        output: wire.output,
      };
    case "tool_error":
      return {
        type: "tool_error",
        turnId,
        toolCallId: wire.toolCallId,
        toolName: wire.toolName,
        errorText: wire.errorText,
      };
    case "belief_flag":
      return {
        type: "belief_flag",
        turnId,
        belief: wire.belief,
        sourceMessageId: wire.sourceMessageId,
      };
    case "turn_aborted":
      return { type: "turn_aborted", turnId: wire.turnId };
    case "turn_failed":
      return { type: "turn_failed", turnId: wire.turnId, error: wire.error };
    case "error":
      return { type: "error", error: wire.error };
  }
}
