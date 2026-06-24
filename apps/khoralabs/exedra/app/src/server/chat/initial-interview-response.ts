import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import { EXEDRA_CONVERSATIONAL_AGENT_ID } from "../authz/facts";
import { getTeam, listTeamMembers } from "../db/membership";
import { getSession } from "../db/sessions";
import { runInternalSearch } from "../http/internal-memories";
import { logger } from "../logger";
import { orgScope } from "../memories/namespaces";
import { dispatchGenerateResponseForChat } from "./dispatch";
import { getChatServiceClient } from "./service-client";
import { ensureInterviewChatThread } from "./session-chat";

function formatMemoryContext(
  hits: Array<{ key: string; namespace: string; snippet: string; score?: number }>,
): string {
  if (hits.length === 0) return "No relevant organization memories found.";
  return hits
    .map((hit, index) => {
      const score = hit.score === undefined ? "" : ` score=${hit.score.toFixed(3)}`;
      return `${index + 1}. [${hit.namespace}:${hit.key}${score}]\n${hit.snippet}`;
    })
    .join("\n\n");
}

async function appendInitialInterviewKickoffMessage(args: {
  db: Database;
  sessionId: string;
  threadId: string;
  userId: string;
}): Promise<void> {
  const session = getSession(args.db, args.sessionId);
  if (session === null) throw new Error(`session not found: ${args.sessionId}`);
  const team = await getTeam(args.db, session.teamId);
  if (team === null) throw new Error(`team not found: ${session.teamId}`);

  const namespace = orgScope(team.orgId);
  let hits: Array<{ key: string; namespace: string; snippet: string; score?: number }> = [];
  let searchError: string | undefined;
  try {
    const result = await runInternalSearch(args.userId, session.topic, 8, namespace, team.orgId);
    hits = result.hits;
  } catch (err) {
    searchError = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: searchError, sessionId: args.sessionId, userId: args.userId, namespace },
      "initial interview memory search failed",
    );
  }
  const message: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      {
        type: "text",
        text: [
          "Start this participant interview by asking the first useful interview question.",
          `Session topic: ${session.topic}`,
          `Organization memory namespace searched: ${namespace}`,
          `Memory search prompt: ${session.topic}`,
          "",
          "Relevant organization memories:",
          formatMemoryContext(hits),
        ].join("\n"),
      },
    ],
    metadata: {
      kickoff: true,
      kind: "initial-interview-rag",
      rag: {
        namespace,
        prompt: session.topic,
        hitCount: hits.length,
        ...(searchError !== undefined ? { error: searchError } : {}),
      },
    },
  };

  await getChatServiceClient().appendPost({
    threadId: args.threadId,
    author: { type: "agent", id: EXEDRA_CONVERSATIONAL_AGENT_ID },
    message,
  });
}

export async function dispatchInitialInterviewResponseForParticipant(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<{ chatThreadId: string }> {
  const interview = await ensureInterviewChatThread({ db, sessionId, userId });
  if (!interview.created) {
    return { chatThreadId: interview.chatThread.id };
  }

  try {
    await appendInitialInterviewKickoffMessage({
      db,
      sessionId,
      threadId: interview.chatThread.id,
      userId,
    });
    await dispatchGenerateResponseForChat({
      chatThreadId: interview.chatThread.id,
      userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, sessionId, userId }, "initial interview response dispatch failed");
  }

  return { chatThreadId: interview.chatThread.id };
}

export async function dispatchInitialInterviewResponsesForTeam(
  db: Database,
  sessionId: string,
  teamId: string,
): Promise<void> {
  for (const member of await listTeamMembers(db, teamId)) {
    await dispatchInitialInterviewResponseForParticipant(db, sessionId, member.userId);
  }
}
