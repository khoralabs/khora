import type { Channel, Thread } from "@khoralabs/chat-core";
import { grantThreadAccess } from "../authz";
import { publishChatThreadAuthzFacts } from "../authz/facts";
import { getTeam } from "../db/membership";
import { getSession, syncFacilitationThreadGrants } from "../db/sessions";
import { getChatService, isChatNotFound } from "./service";
import { facilitationChatThreadId, interviewChatThreadId, sessionChannelId } from "./thread-ids";

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
}): Promise<{ chatThread: Thread; created: boolean }> {
  await ensureSessionChatChannel(params.sessionId);
  const chat = getChatService();
  const threadId = interviewChatThreadId(params.sessionId, params.userId);
  try {
    await grantThreadAccess(params.userId, threadId);
    return { chatThread: await chat.getThread(threadId), created: false };
  } catch (error) {
    if (!isChatNotFound(error)) throw error;
    const chatThread = await chat.createThread({
      id: threadId,
      root: { type: "channel", channelId: sessionChannelId(params.sessionId) },
      metadata: {
        kind: "interview",
        sessionId: params.sessionId,
        userId: params.userId,
      },
    });
    await grantThreadAccess(params.userId, threadId);
    const session = getSession(params.db, params.sessionId);
    if (session !== null) {
      const team = await getTeam(params.db, session.teamId);
      if (team !== null) {
        await publishChatThreadAuthzFacts({
          chatThreadId: threadId,
          sessionId: params.sessionId,
          orgId: team.orgId,
        });
      }
    }
    return {
      created: true,
      chatThread,
    };
  }
}

export async function ensureFacilitationChatThread(params: {
  db: import("bun:sqlite").Database;
  sessionId: string;
}): Promise<{ chatThread: Thread; created: boolean }> {
  await ensureSessionChatChannel(params.sessionId);
  const chat = getChatService();
  const threadId = facilitationChatThreadId(params.sessionId);
  try {
    await syncFacilitationThreadGrants(params.db, params.sessionId);
    return { chatThread: await chat.getThread(threadId), created: false };
  } catch (error) {
    if (!isChatNotFound(error)) throw error;
    const chatThread = await chat.createThread({
      id: threadId,
      root: { type: "channel", channelId: sessionChannelId(params.sessionId) },
      metadata: {
        kind: "facilitation",
        sessionId: params.sessionId,
      },
    });
    await syncFacilitationThreadGrants(params.db, params.sessionId);
    const session = getSession(params.db, params.sessionId);
    if (session !== null) {
      const team = await getTeam(params.db, session.teamId);
      if (team !== null) {
        await publishChatThreadAuthzFacts({
          chatThreadId: threadId,
          sessionId: params.sessionId,
          orgId: team.orgId,
        });
      }
    }
    return {
      created: true,
      chatThread,
    };
  }
}
