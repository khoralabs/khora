import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";

import { createModel, getAgentRegistry, runInterviewTurn } from "../../agents/index";
import {
  buildInterviewKickoffMessage,
  type InterviewSessionMeta,
  interviewKickoffMessageId,
} from "../../agents/interview/instructions";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../db/messages";
import { getSession, getThread, type SessionRecord } from "../db/sessions";

type InterviewWsSender = {
  send: (data: string) => void;
};

export async function runInterviewUserTurn(args: {
  db: Database;
  ws: InterviewWsSender;
  threadId: string;
  session: SessionRecord;
  text: string;
  userMessageId: string;
  metadata?: UIMessage["metadata"];
}): Promise<void> {
  const { db, ws, threadId, session, text, userMessageId, metadata } = args;
  const userIndex = nextMessageIndex(db, threadId);
  const userParts: UIMessage["parts"] = [{ type: "text", text }];
  insertMessage(db, {
    id: userMessageId,
    threadId,
    role: "user",
    parts: userParts,
    messageIndex: userIndex,
    metadata,
  });

  ws.send(
    JSON.stringify({
      type: "user_message_saved",
      message: { id: userMessageId, role: "user", parts: userParts },
    }),
  );

  await runInterviewAssistantTurn({
    db,
    ws,
    threadId,
    session,
    userMessageId,
  });
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

  try {
    const { assistantParts, beliefFlags } = await runInterviewTurn({
      registry: getAgentRegistry(),
      model: createModel(),
      sessionId: session.id,
      sessionMeta,
      threadId,
      userMessageId,
      history,
      onTextDelta: (delta) => ws.send(JSON.stringify({ type: "text_delta", delta })),
      onBeliefFlag: (belief, sourceMessageId) =>
        ws.send(JSON.stringify({ type: "belief_flag", belief, sourceMessageId })),
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
