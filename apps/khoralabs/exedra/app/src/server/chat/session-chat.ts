import type { Channel, Thread } from "@khoralabs/chat-core";

import { getOrCreateFacilitationThread, getOrCreateInterviewThread } from "../db/sessions";
import { getChatService, isChatNotFound } from "./service";

export type ExedraChatThreadKind = "interview" | "facilitation";

export function sessionChannelId(sessionId: string): string {
  return `session:${sessionId}`;
}

export function interviewChatThreadId(sessionId: string, userId: string): string {
  return `session:${sessionId}:interview:${userId}`;
}

export function facilitationChatThreadId(sessionId: string): string {
  return `session:${sessionId}:facilitation`;
}

export async function ensureSessionChatChannel(sessionId: string): Promise<Channel> {
  const chat = getChatService();
  const channelId = sessionChannelId(sessionId);
  try {
    return await chat.getChannel(channelId);
  } catch (error) {
    if (!isChatNotFound(error)) throw error;
    return chat.createChannel({
      id: channelId,
      metadata: { kind: "session", sessionId },
    });
  }
}

export async function ensureInterviewChatThread(params: {
  db: import("bun:sqlite").Database;
  sessionId: string;
  userId: string;
}): Promise<{ legacyThreadId: string; chatThread: Thread }> {
  const legacyThreadId = getOrCreateInterviewThread(params.db, {
    sessionId: params.sessionId,
    userId: params.userId,
  });
  await ensureSessionChatChannel(params.sessionId);
  const chat = getChatService();
  const threadId = interviewChatThreadId(params.sessionId, params.userId);
  try {
    return { legacyThreadId, chatThread: await chat.getThread(threadId) };
  } catch (error) {
    if (!isChatNotFound(error)) throw error;
    return {
      legacyThreadId,
      chatThread: await chat.createThread({
        id: threadId,
        root: { type: "channel", channelId: sessionChannelId(params.sessionId) },
        metadata: {
          kind: "interview",
          sessionId: params.sessionId,
          userId: params.userId,
          legacyThreadId,
        },
      }),
    };
  }
}

export async function ensureFacilitationChatThread(params: {
  db: import("bun:sqlite").Database;
  sessionId: string;
}): Promise<{ legacyThreadId: string; chatThread: Thread }> {
  const legacyThreadId = getOrCreateFacilitationThread(params.db, params.sessionId);
  await ensureSessionChatChannel(params.sessionId);
  const chat = getChatService();
  const threadId = facilitationChatThreadId(params.sessionId);
  try {
    return { legacyThreadId, chatThread: await chat.getThread(threadId) };
  } catch (error) {
    if (!isChatNotFound(error)) throw error;
    return {
      legacyThreadId,
      chatThread: await chat.createThread({
        id: threadId,
        root: { type: "channel", channelId: sessionChannelId(params.sessionId) },
        metadata: {
          kind: "facilitation",
          sessionId: params.sessionId,
          legacyThreadId,
        },
      }),
    };
  }
}
