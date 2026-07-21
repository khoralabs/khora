import type { ChatEvent, ChatService } from "@khoralabs/chat-core";
import {
  type ChatHttpRuntime,
  type ChatStorage,
  createChatHttpRuntime,
  isChatNotFound,
} from "@khoralabs/chat-http/service";
import {
  closeLocalSqliteDatabase,
  createLocalSqliteDatabase,
  createTursoChatPersistence,
  type SqlDatabase,
} from "@khoralabs/chat-persistence-turso";

import { applyExedraChatEnv, resolveExedraChatDbPath } from "./config";

export { isChatNotFound, resolveExedraChatDbPath };

let db: SqlDatabase | undefined;
let storage: ChatStorage | undefined;
let runtime: ChatHttpRuntime | undefined;

function ensureRuntime(): ChatHttpRuntime {
  applyExedraChatEnv();
  if (runtime !== undefined) return runtime;

  const opened = createLocalSqliteDatabase(resolveExedraChatDbPath());
  db = opened;
  storage = {
    persistence: createTursoChatPersistence(opened),
    close() {
      closeLocalSqliteDatabase(opened);
    },
  };
  runtime = createChatHttpRuntime({ persistence: storage.persistence });
  return runtime;
}

/** Eager init for server startup (async for API parity with older chat-http). */
export async function initChatStorage(): Promise<void> {
  ensureRuntime();
}

export function getChatDb(): SqlDatabase {
  ensureRuntime();
  if (db === undefined) throw new Error("chat db not initialized");
  return db;
}

export function getChatService(): ChatService {
  return ensureRuntime().service;
}

export function subscribeToChatThread(
  threadId: string,
  send: (event: ChatEvent) => void,
): () => void {
  return ensureRuntime().subscribeToThread(threadId, send);
}

export function closeChatDb(): void {
  runtime?.close();
  storage?.close();
  runtime = undefined;
  storage = undefined;
  db = undefined;
}
