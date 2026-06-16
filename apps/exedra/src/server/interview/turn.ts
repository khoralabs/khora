import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";

import { createModel, getAgentRegistry, runInterviewTurn } from "../../agents/index";
import {
  buildInterviewKickoffMessage,
  type InterviewSessionMeta,
  interviewKickoffMessageId,
} from "../../agents/interview/instructions";
import { getOrg, getTeam } from "../db/membership";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../db/messages";
import { getSession, getThread, type SessionRecord } from "../db/sessions";
import {
  formatDocumentContextForModel,
  resolveUserMessageDocuments,
} from "../documents/message-context";
import { finishOnboardingInterview } from "../onboarding/interview";

type InterviewWsSender = {
  send: (data: string) => void;
};

export type RunInterviewUserTurnResult = { ok: true } | { ok: false; error: string };

export async function runInterviewUserTurn(args: {
  db: Database;
  ws: InterviewWsSender;
  threadId: string;
  session: SessionRecord;
  text: string;
  userMessageId: string;
  documentIds?: readonly string[];
  metadata?: UIMessage["metadata"];
}): Promise<RunInterviewUserTurnResult> {
  const { db, ws, threadId, session, text, userMessageId, documentIds, metadata } = args;

  const thread = getThread(db, threadId);
  if (thread?.user_id === null || thread?.user_id === undefined) {
    return { ok: false, error: "Thread user not found" };
  }

  let documentsMetadata: ReturnType<typeof resolveUserMessageDocuments> | undefined;
  if (documentIds !== undefined && documentIds.length > 0) {
    const resolved = resolveUserMessageDocuments(db, {
      sessionId: session.id,
      teamId: session.teamId,
      userId: thread.user_id,
      documentIds,
    });
    if ("error" in resolved) {
      return { ok: false, error: resolved.error };
    }
    documentsMetadata = resolved;
  }

  const summariesById = new Map<string, string>();
  if (Array.isArray(documentsMetadata)) {
    for (const document of documentsMetadata) {
      const record = db
        .query<{ summary: string }, [string]>(
          `SELECT summary FROM session_documents WHERE id = ? LIMIT 1`,
        )
        .get(document.id);
      if (record !== null) summariesById.set(document.id, record.summary);
    }
  }

  const attachmentContext =
    Array.isArray(documentsMetadata) && documentsMetadata.length > 0
      ? formatDocumentContextForModel(documentsMetadata, summariesById)
      : "";
  const modelText =
    attachmentContext.length > 0
      ? text.trim().length > 0
        ? `${text.trim()}\n\n${attachmentContext}`
        : attachmentContext
      : text;

  const userIndex = nextMessageIndex(db, threadId);
  const userParts: UIMessage["parts"] = [{ type: "text", text: modelText }];
  const messageMetadata =
    Array.isArray(documentsMetadata) && documentsMetadata.length > 0
      ? {
          ...(metadata ?? {}),
          documents: documentsMetadata,
          displayText: text,
        }
      : metadata;

  insertMessage(db, {
    id: userMessageId,
    threadId,
    role: "user",
    parts: userParts,
    messageIndex: userIndex,
    metadata: messageMetadata,
  });

  ws.send(
    JSON.stringify({
      type: "user_message_saved",
      message: {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text }],
        ...(Array.isArray(documentsMetadata) && documentsMetadata.length > 0
          ? {
              metadata: {
                documents: documentsMetadata.map((document) => ({
                  id: document.id,
                  fileName: document.fileName,
                })),
              },
            }
          : {}),
      },
    }),
  );

  await runInterviewAssistantTurn({
    db,
    ws,
    threadId,
    session,
    userMessageId,
  });

  return { ok: true };
}

async function runInterviewAssistantTurn(args: {
  db: Database;
  ws: InterviewWsSender;
  threadId: string;
  session: SessionRecord;
  userMessageId: string;
}): Promise<void> {
  const { db, ws, threadId, session, userMessageId } = args;
  const history = loadThreadMessages(db, threadId);
  const assistantId = nanoid();
  const sessionMeta: InterviewSessionMeta = {
    topic: session.topic,
  };
  const team = getTeam(db, session.teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  const onboardingMeta =
    session.kind === "onboarding" && team !== null && org !== null
      ? { orgName: org.name, teamName: team.name }
      : undefined;
  const thread = getThread(db, threadId);

  try {
    const { assistantParts, beliefFlags, onboardingCompleted } = await runInterviewTurn({
      registry: getAgentRegistry(),
      model: createModel(),
      sessionId: session.id,
      sessionMeta,
      onboardingMeta,
      threadId,
      userMessageId,
      history,
      onTextDelta: (delta) => ws.send(JSON.stringify({ type: "text_delta", delta })),
      onBeliefFlag: (belief, sourceMessageId) =>
        ws.send(JSON.stringify({ type: "belief_flag", belief, sourceMessageId })),
      onCompleteOnboarding:
        onboardingMeta !== undefined && thread?.user_id != null
          ? (summary) => {
              finishOnboardingInterview({
                db,
                threadId,
                sessionId: session.id,
                teamId: session.teamId,
                userId: thread.user_id as string,
                summary,
              });
              ws.send(JSON.stringify({ type: "onboarding_complete", summary }));
            }
          : undefined,
      onToolEvent: (event) => {
        if (event.type === "call") {
          ws.send(
            JSON.stringify({
              type: "tool_call",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
            }),
          );
          return;
        }
        if (event.type === "result") {
          ws.send(
            JSON.stringify({
              type: "tool_result",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              output: event.output,
            }),
          );
          return;
        }
        ws.send(
          JSON.stringify({
            type: "tool_error",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            errorText: event.errorText,
          }),
        );
      },
    });

    const assistantIndex = nextMessageIndex(db, threadId);
    insertMessage(db, {
      id: assistantId,
      threadId,
      role: "assistant",
      parts: assistantParts.length > 0 ? assistantParts : [{ type: "text", text: "" }],
      messageIndex: assistantIndex,
      metadata: beliefFlags.length > 0 ? { beliefFlags } : undefined,
    });

    ws.send(
      JSON.stringify({
        type: "assistant_message",
        message: {
          id: assistantId,
          role: "assistant",
          parts: assistantParts,
          ...(beliefFlags.length > 0 ? { metadata: { beliefFlags } } : {}),
        },
        ...(onboardingCompleted ? { onboardingCompleted: true } : {}),
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Interview agent failed";
    ws.send(JSON.stringify({ type: "error", error: msg }));
  }
}

export async function ensureInterviewKickoff(
  db: Database,
  ws: InterviewWsSender,
  threadId: string,
): Promise<void> {
  const thread = getThread(db, threadId);
  if (thread === null) return;

  const existing = loadThreadMessages(db, threadId);
  if (existing.length > 0) return;

  const session = getSession(db, thread.session_id);
  if (session === null) return;

  const kickoffText = buildInterviewKickoffMessage({
    topic: session.topic,
  });

  await runInterviewUserTurn({
    db,
    ws,
    threadId,
    session,
    text: kickoffText,
    userMessageId: interviewKickoffMessageId(threadId),
    metadata: { kickoff: true },
  });
}
