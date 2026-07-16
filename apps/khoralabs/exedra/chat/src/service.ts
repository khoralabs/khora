import type { ChatEvent, ChatService } from "@khoralabs/chat-core";
import {
  closeChatDb as closeChatHttpDb,
  getChatDb as getChatHttpDb,
  getChatService as getChatHttpService,
  initChatStorage as initChatHttpStorage,
  isChatNotFound,
  subscribeToChatThread as subscribeChatHttpThread,
} from "@khoralabs/chat-http/service";
import type { SqlDatabase } from "@khoralabs/chat-persistence-turso";

import { applyExedraChatEnv, resolveExedraChatDbPath } from "./config";

export { isChatNotFound, resolveExedraChatDbPath };

export async function initChatStorage(): Promise<void> {
  applyExedraChatEnv();
  await initChatHttpStorage();
}

export function getChatDb(): SqlDatabase {
  applyExedraChatEnv();
  return getChatHttpDb();
}

export function getChatService(): ChatService {
  applyExedraChatEnv();
  return getChatHttpService();
}

export function subscribeToChatThread(
  threadId: string,
  send: (event: ChatEvent) => void,
): () => void {
  applyExedraChatEnv();
  return subscribeChatHttpThread(threadId, send);
}

export function closeChatDb(): void {
  closeChatHttpDb();
}
