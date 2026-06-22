import { nanoid } from "nanoid";

import { isAbortError, TurnAbortedError } from "../../../agents/errors";
import type { InterviewSessionMeta } from "../../../agents/interview/instructions";
import { getOrg, getTeam } from "../../db/membership";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../../db/messages";
import { getThread } from "../../db/sessions";
import { resolveSessionOrgId, resolveSessionTargetNamespace } from "../../documents/accept";
import { getDocumentById, patchDocumentsBatchId } from "../../documents/db";
import { dispatchBatchIntegrationForDocuments } from "../../documents/dispatch-batch-integration";
import { loadTurnDocumentAttachments } from "../../documents/load-turn-attachments";
import {
  resolveUserMessageDocuments,
  toClientMessageDocuments,
} from "../../documents/message-context";
import { createJob } from "../../jobs/db.js";
import { resolveViewerAuthor } from "../../messages/resolve-author";
import { withSpan } from "../../telemetry/spans";
import {
  recordTurnCompleted,
  recordTurnStarted,
  type TurnCompletionStatus,
} from "../../telemetry/turn-metrics";
import {
  dispatchInterviewTurn,
  isInterviewTurnWorkflowConfigured,
} from "../dispatch-interview-turn.js";
import { failInterviewTurn } from "../fail-interview-turn.js";
import { finalizeInterviewTurn } from "../finalize-turn.js";
import {
  buildInterviewMemorySearch,
  buildInterviewMemorySearchContext,
  resolveInterviewMemoryContext,
} from "../memory-retrieval";
import { rollbackAbortedTurn } from "./rollback";
import type { ExecuteTurnInput, TurnEngineDeps } from "./types";

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new TurnAbortedError();
  }
}

export async function executeTurn(deps: TurnEngineDeps, args: ExecuteTurnInput): Promise<void> {
  const turnStart = performance.now();
  recordTurnStarted();
  let status: TurnCompletionStatus = "success";

  try {
    await withSpan(
      "interview.turn",
      {
        "turn.id": args.turnId,
        "thread.id": args.threadId,
        "session.id": args.session.id,
        "session.kind": args.session.kind,
      },
      async (span) => {
        await executeTurnBody(deps, args, (next) => {
          status = next;
        });
        span.setAttribute("turn.status", status);
      },
    );
  } catch (err) {
    status = "error";
    throw err;
  } finally {
    recordTurnCompleted(status, Math.round(performance.now() - turnStart));
  }
}

async function executeTurnBody(
  deps: TurnEngineDeps,
  args: ExecuteTurnInput,
  setStatus: (status: TurnCompletionStatus) => void,
): Promise<void> {
  const {
    db,
    threadId,
    turnId,
    session,
    text,
    documentIds = [],
    metadata,
    userTimeZone,
    signal,
    emit,
  } = args;

  const thread = getThread(db, threadId);
  if (thread?.user_id === null || thread?.user_id === undefined) {
    setStatus("error");
    emit({ type: "error", error: "Thread user not found" });
    return;
  }

  const userId = thread.user_id;

  let documentsMetadata: ReturnType<typeof resolveUserMessageDocuments> | undefined;
  let documentAttachments: Awaited<ReturnType<typeof loadTurnDocumentAttachments>> = [];
  if (documentIds.length > 0) {
    const resolved = resolveUserMessageDocuments(db, {
      sessionId: session.id,
      teamId: session.teamId,
      userId,
      documentIds,
    });
    if ("error" in resolved) {
      setStatus("error");
      emit({ type: "error", error: resolved.error });
      return;
    }
    documentsMetadata = resolved;

    try {
      documentAttachments = await loadTurnDocumentAttachments({
        db,
        sessionId: session.id,
        teamId: session.teamId,
        userId,
        documentIds,
      });
    } catch (err) {
      setStatus("error");
      emit({ type: "error", error: err instanceof Error ? err.message : "Document load failed" });
      return;
    }
  }

  const attachmentNames =
    Array.isArray(documentsMetadata) && documentsMetadata.length > 0
      ? documentsMetadata.map((document) => document.fileName).join(", ")
      : "";
  const modelText =
    attachmentNames.length > 0
      ? text.trim().length > 0
        ? `${text.trim()}\n\nAttached: ${attachmentNames}`
        : `Attached: ${attachmentNames}`
      : text;

  const userParts = [{ type: "text" as const, text: modelText }];
  const messageMetadata =
    Array.isArray(documentsMetadata) && documentsMetadata.length > 0
      ? {
          ...(metadata ?? {}),
          documents: documentsMetadata,
          displayText: text,
        }
      : metadata;

  const sessionMeta: InterviewSessionMeta = { topic: session.topic };
  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    setStatus("error");
    emit({ type: "error", error: "Organization not found for session" });
    return;
  }
  const onboardingMeta =
    session.kind === "onboarding" ? { orgName: org.name, teamName: team.name } : undefined;

  const assistantId = nanoid();
  let userCreatedAtMs = 0;

  db.run("BEGIN IMMEDIATE");
  try {
    assertNotAborted(signal);

    const userIndex = nextMessageIndex(db, threadId);
    userCreatedAtMs = insertMessage(db, {
      id: turnId,
      threadId,
      role: "user",
      parts: userParts,
      messageIndex: userIndex,
      metadata: messageMetadata,
      authorDid: userId,
    });

    db.run("COMMIT");
  } catch (err) {
    try {
      db.run("ROLLBACK");
    } catch {
      // ignore
    }
    if (isAbortError(err) || signal.aborted) {
      await rollbackAbortedTurn({
        db,
        turnId,
        sessionId: session.id,
        teamId: session.teamId,
        userId,
        documentIds,
      });
      setStatus("aborted");
      emit({ type: "turn_aborted", turnId });
      return;
    }
    setStatus("error");
    emit({ type: "error", error: err instanceof Error ? err.message : "Failed to save message" });
    return;
  }

  const userAuthor = resolveViewerAuthor(db, userId);
  const kickoff = (metadata as { kickoff?: boolean } | undefined)?.kickoff === true;
  const savedMetadata =
    kickoff || (Array.isArray(documentsMetadata) && documentsMetadata.length > 0)
      ? {
          ...(kickoff ? { kickoff: true as const } : {}),
          ...(Array.isArray(documentsMetadata) && documentsMetadata.length > 0
            ? {
                documents: toClientMessageDocuments(documentsMetadata),
              }
            : {}),
        }
      : undefined;

  emit({
    type: "user_message_saved",
    message: {
      id: turnId,
      role: "user",
      parts: [{ type: "text", text }],
      ...(savedMetadata !== undefined ? { metadata: savedMetadata } : {}),
    },
    createdAtMs: userCreatedAtMs,
    author: userAuthor,
  });

  assertNotAborted(signal);

  if (documentIds.length > 0) {
    const orgId = resolveSessionOrgId(db, session.teamId);
    patchDocumentsBatchId(db, documentIds, turnId);
    const firstDocument = getDocumentById(db, documentIds[0] ?? "");
    const namespace =
      firstDocument?.targetNamespace ??
      resolveSessionTargetNamespace(userId, orgId, session.teamId, session.id);
    void dispatchBatchIntegrationForDocuments({
      db,
      batchId: turnId,
      params: {
        batchId: turnId,
        userId,
        namespace,
        orgId,
        teamId: session.teamId,
        sessionId: session.id,
        contextText: text.trim(),
      },
    });
  }

  if (isInterviewTurnWorkflowConfigured()) {
    createJob(db, {
      id: turnId,
      kind: "interview_turn",
      ownerUserId: userId,
      payload: {
        threadId,
        sessionId: session.id,
        displayText: text,
        userTimeZone,
        kickoff,
        documentIds,
        onboardingMeta,
      },
    });

    try {
      await dispatchInterviewTurn({
        jobId: turnId,
        threadId,
        turnId,
        sessionId: session.id,
        userId,
        orgId: org.id,
        teamId: session.teamId,
        ...(userTimeZone !== undefined ? { userTimeZone } : {}),
        ...(documentIds.length > 0 ? { documentIds: [...documentIds] } : {}),
        ...(kickoff ? { kickoff: true } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dispatch interview turn";
      await failInterviewTurn({
        db,
        turnId,
        threadId,
        sessionId: session.id,
        teamId: session.teamId,
        userId,
        documentIds,
        error: message,
        emit,
      });
      setStatus("error");
    }
    return;
  }

  const history = loadThreadMessages(db, threadId, 50);
  const interviewMemoryContext = resolveInterviewMemoryContext(db, {
    orgId: org.id,
    teamId: session.teamId,
    sessionId: session.id,
    participantUserId: userId,
  });

  const memoryContext = await buildInterviewMemorySearchContext(db, {
    orgId: org.id,
    teamId: session.teamId,
    sessionId: session.id,
    participantUserId: userId,
    userMessageText: text,
    sessionTopic: session.topic,
  });
  const memorySearch = buildInterviewMemorySearch(interviewMemoryContext);

  try {
    const {
      assistantParts,
      beliefFlags,
      sessionCompleted: completed,
      sessionCompletion,
    } = await deps.runInterviewTurn({
      registry: deps.getAgentRegistry(),
      model: deps.createModel(),
      sessionId: session.id,
      sessionMeta,
      onboardingMeta,
      orgId: org.id,
      teamId: session.teamId,
      participantUserId: userId,
      memoryContext,
      memorySearch,
      sessionInterviewComplete: session.interviewCompletedAtMs !== null,
      threadId,
      userMessageId: turnId,
      history,
      userTimeZone,
      abortSignal: signal,
      documentAttachments,
      onTextDelta: (delta) => {
        if (signal.aborted) return;
        emit({ type: "text_delta", turnId, delta });
      },
      onBeliefFlag: (belief, sourceMessageId) => {
        if (signal.aborted) return;
        emit({ type: "belief_flag", turnId, belief, sourceMessageId });
      },
      onToolEvent: (event) => {
        if (signal.aborted) return;
        if (event.type === "call") {
          emit({
            type: "tool_call",
            turnId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          });
          return;
        }
        if (event.type === "result") {
          emit({
            type: "tool_result",
            turnId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            output: event.output,
          });
          return;
        }
        emit({
          type: "tool_error",
          turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          errorText: event.errorText,
        });
      },
    });

    const sessionCompleted = completed;
    assertNotAborted(signal);

    finalizeInterviewTurn({
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
      emit,
    });
  } catch (err: unknown) {
    if (isAbortError(err) || signal.aborted) {
      await rollbackAbortedTurn({
        db,
        turnId,
        sessionId: session.id,
        teamId: session.teamId,
        userId,
        documentIds,
      });
      setStatus("aborted");
      emit({ type: "turn_aborted", turnId });
      return;
    }

    setStatus("error");
    const msg = err instanceof Error ? err.message : "Interview agent failed";
    await failInterviewTurn({
      db,
      turnId,
      threadId,
      sessionId: session.id,
      teamId: session.teamId,
      userId,
      documentIds,
      error: msg,
      emit,
    });
  }
}
