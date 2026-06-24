import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ChatEvent, ChatService } from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";

import { resolveExedraChatDbPath } from "./config";

let chatDbSingleton: Database | undefined;
let chatServiceSingleton: ChatService | undefined;

const subscribers = new Map<string, Set<(event: ChatEvent) => void>>();

export { resolveExedraChatDbPath };

export function getChatDb(): Database {
  if (chatDbSingleton !== undefined) return chatDbSingleton;
  const dbPath = resolveExedraChatDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  ensureChatSqliteSchema(db);
  chatDbSingleton = db;
  return db;
}

export function getChatService(): ChatService {
  if (chatServiceSingleton !== undefined) return chatServiceSingleton;
  chatServiceSingleton = createChatService(createSqliteChatPersistence(getChatDb()), {
    onEvent(event) {
      if (!("threadId" in event)) return;
      for (const send of subscribers.get(event.threadId) ?? []) send(event);
    },
  });
  return chatServiceSingleton;
}

export function subscribeToChatThread(
  threadId: string,
  send: (event: ChatEvent) => void,
): () => void {
  const set = subscribers.get(threadId) ?? new Set<(event: ChatEvent) => void>();
  set.add(send);
  subscribers.set(threadId, set);
  return () => {
    set.delete(send);
    if (set.size === 0) subscribers.delete(threadId);
  };
}

export function closeChatDb(): void {
  chatDbSingleton?.close();
  chatDbSingleton = undefined;
  chatServiceSingleton = undefined;
  subscribers.clear();
}

export function isChatNotFound(error: unknown): error is ChatNotFoundError {
  return error instanceof ChatNotFoundError;
}
