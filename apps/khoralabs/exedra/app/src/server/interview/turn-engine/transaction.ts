import { nanoid } from "nanoid";

import { isAbortError, TurnAbortedError } from "../../../agents/errors";
import type { InterviewSessionMeta } from "../../../agents/interview/instructions";
import { getOrg, getTeam } from "../../db/membership";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../../db/messages";
import { getThread, markSessionInterviewComplete } from "../../db/sessions";
import { dispatchDocumentProcessingForTurn } from "../../documents/dispatch-document-processing";
import { resolveSessionOrgId } from "../../documents/ingest";
import { loadTurnDocumentAttachments } from "../../documents/load-turn-attachments";
import { resolveUserMessageDocuments } from "../../documents/message-context";
import { logger } from "../../logger";
import { resolveOrgAgentAuthorForOrg, resolveViewerAuthor } from "../../messages/resolve-author";
import { applyOnboardingCompletionSideEffects } from "../../onboarding/interview";
import { withSpan } from "../../telemetry/spans";
import {
  recordTurnCompleted,
  recordTurnStarted,
  type TurnCompletionStatus,
} from "../../telemetry/turn-metrics";
import { rollbackTurnDocuments } from "./rollback";
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
  let sessionCompleted = false;

  db.run("BEGIN IMMEDIATE");

  try {
    assertNotAborted(signal);

    const userIndex = nextMessageIndex(db, threadId);
    const userCreatedAtMs = insertMessage(db, {
      id: turnId,
      threadId,
      role: "user",
      parts: userParts,
      messageIndex: userIndex,
      metadata: messageMetadata,
      authorDid: userId,
    });

    const userAuthor = resolveViewerAuthor(db, userId);

    const kickoff = (metadata as { kickoff?: boolean } | undefined)?.kickoff === true;
    const savedMetadata =
      kickoff || (Array.isArray(documentsMetadata) && documentsMetadata.length > 0)
        ? {
            ...(kickoff ? { kickoff: true as const } : {}),
            ...(Array.isArray(documentsMetadata) && documentsMetadata.length > 0
              ? {
                  documents: documentsMetadata.map((document) => ({
                    id: document.id,
                    fileName: document.fileName,
                  })),
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
      void dispatchDocumentProcessingForTurn({
        db,
        documents: documentIds.map((documentId) => ({ documentId })),
        params: {
          userId,
          sessionId: session.id,
          teamId: session.teamId,
          orgId,
          turnId,
        },
      });
    }

    const history = loadThreadMessages(db, threadId, 50);

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
      sessionInterviewComplete: session.interviewCompletedAtMs !== null,
      threadId,
      userMessageId: turnId,
      history,
      userTimeZone,
      abortSignal: signal,
      documentAttachments,
      onTextDelta: (delta) => {
        if (signal.aborted) return;
        emit({ type: "text_delta", delta });
      },
      onBeliefFlag: (belief, sourceMessageId) => {
        if (signal.aborted) return;
        emit({ type: "belief_flag", belief, sourceMessageId });
      },
      onToolEvent: (event) => {
        if (signal.aborted) return;
        if (event.type === "call") {
          emit({
            type: "tool_call",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          });
          return;
        }
        if (event.type === "result") {
          emit({
            type: "tool_result",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            output: event.output,
          });
          return;
        }
        emit({
          type: "tool_error",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          errorText: event.errorText,
        });
      },
    });

    sessionCompleted = completed;
    assertNotAborted(signal);

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

    db.run("COMMIT");

    if (sessionCompletion != null) {
      markSessionInterviewComplete(db, session.id, sessionCompletion);

      if (onboardingMeta !== undefined && thread.user_id != null) {
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

      emit({
        type: "session_complete",
        completion: {
          summary: sessionCompletion.summary,
          nextSessionOptions: sessionCompletion.nextSessionOptions,
          sessionKind: session.kind,
        },
      });
    }

    emit({
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
  } catch (err: unknown) {
    try {
      db.run("ROLLBACK");
    } catch {
      // ignore nested rollback failures
    }

    if (isAbortError(err) || signal.aborted) {
      await rollbackTurnDocuments({
        db,
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
    emit({ type: "error", error: msg });
  }
}
