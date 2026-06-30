import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ChatService } from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";

import { resolveAgentDataDir } from "./paths.ts";

export const HARNESS_AGENT_CHANNEL_ID = "harness-agent";
export const HARNESS_AGENT_THREAD_ID = "harness-agent-self";

let chatService: ChatService | undefined;

function openChatDatabase(): Database {
  const dataDir = resolveAgentDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "chat.sqlite");
  const db = new Database(dbPath);
  ensureChatSqliteSchema(db);
  return db;
}

export function getAgentChatService(): ChatService {
  if (chatService !== undefined) return chatService;
  chatService = createChatService(createSqliteChatPersistence(openChatDatabase()));
  return chatService;
}

export async function ensureAgentChatThread(): Promise<{ channelId: string; threadId: string }> {
  const service = getAgentChatService();

  try {
    await service.getChannel(HARNESS_AGENT_CHANNEL_ID);
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    await service.createChannel({
      id: HARNESS_AGENT_CHANNEL_ID,
      metadata: { title: "Network Harness Agent", kind: "self-chat" },
    });
  }

  try {
    await service.getThread(HARNESS_AGENT_THREAD_ID);
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    await service.createThread({
      id: HARNESS_AGENT_THREAD_ID,
      root: { type: "channel", channelId: HARNESS_AGENT_CHANNEL_ID },
      metadata: { title: "Agent self-thread", kind: "agent-monologue" },
    });
  }

  return { channelId: HARNESS_AGENT_CHANNEL_ID, threadId: HARNESS_AGENT_THREAD_ID };
}
