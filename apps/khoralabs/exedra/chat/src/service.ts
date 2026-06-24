import type { ChatEvent, ChatService } from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  closeLocalSqliteDatabase,
  createLocalSqliteDatabase,
  createTursoChatPersistence,
  createTursoDatabase,
  ensureChatSchema,
  type SqlDatabase,
} from "@khoralabs/chat-persistence-turso";

import { resolveExedraChatDbPath } from "./config";

export { resolveExedraChatDbPath };

let chatDbSingleton: SqlDatabase | undefined;
let chatServiceSingleton: ChatService | undefined;
let chatStorageReady: Promise<void> | undefined;

const subscribers = new Map<string, Set<(event: ChatEvent) => void>>();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

function usesTursoBackend(): boolean {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  return url !== undefined && url.length > 0;
}

function createChatDatabase(): SqlDatabase {
  if (usesTursoBackend()) {
    return createTursoDatabase({
      url: requireEnv("TURSO_DATABASE_URL"),
      authToken: requireEnv("TURSO_AUTH_TOKEN"),
    });
  }
  return createLocalSqliteDatabase(resolveExedraChatDbPath());
}

export async function initChatStorage(): Promise<void> {
  if (chatStorageReady !== undefined) {
    await chatStorageReady;
    return;
  }
  chatStorageReady = (async () => {
    if (chatDbSingleton === undefined) {
      chatDbSingleton = createChatDatabase();
      if (usesTursoBackend()) {
        await ensureChatSchema(chatDbSingleton);
      }
    }
    if (chatServiceSingleton === undefined) {
      chatServiceSingleton = createChatService(createTursoChatPersistence(chatDbSingleton), {
        onEvent(event) {
          if (!("threadId" in event)) return;
          for (const send of subscribers.get(event.threadId) ?? []) send(event);
        },
      });
    }
  })();
  await chatStorageReady;
}

export function getChatDb(): SqlDatabase {
  if (chatDbSingleton === undefined) {
    chatDbSingleton = createChatDatabase();
  }
  return chatDbSingleton;
}

export function getChatService(): ChatService {
  if (chatServiceSingleton === undefined) {
    chatServiceSingleton = createChatService(createTursoChatPersistence(getChatDb()), {
      onEvent(event) {
        if (!("threadId" in event)) return;
        for (const send of subscribers.get(event.threadId) ?? []) send(event);
      },
    });
  }
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
  if (chatDbSingleton !== undefined) {
    closeLocalSqliteDatabase(chatDbSingleton);
  }
  chatDbSingleton = undefined;
  chatServiceSingleton = undefined;
  chatStorageReady = undefined;
  subscribers.clear();
}

export function isChatNotFound(error: unknown): error is ChatNotFoundError {
  return error instanceof ChatNotFoundError;
}
