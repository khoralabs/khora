import type { Database } from "bun:sqlite";

import { listTeamMembers } from "../db/membership";
import { logger } from "../logger";
import { dispatchGenerateResponseForChat } from "./dispatch";
import { ensureInterviewChatThread } from "./session-chat";

export async function dispatchInitialInterviewResponseForParticipant(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<{ legacyThreadId: string; chatThreadId: string }> {
  const interview = await ensureInterviewChatThread({ db, sessionId, userId });
  if (!interview.created) {
    return { legacyThreadId: interview.legacyThreadId, chatThreadId: interview.chatThread.id };
  }

  try {
    await dispatchGenerateResponseForChat({
      legacyThreadId: interview.legacyThreadId,
      chatThreadId: interview.chatThread.id,
      userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, sessionId, userId }, "initial interview response dispatch failed");
  }

  return { legacyThreadId: interview.legacyThreadId, chatThreadId: interview.chatThread.id };
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
