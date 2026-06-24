import { type ChatServiceClient, createChatClient } from "@khoralabs/exedra-chat/client";

import { createTestChatClient } from "./test-service";

let cachedClient: ChatServiceClient | null | undefined;

function chatServiceUrl(): string | null {
  const value = process.env.EXEDRA_CHAT_SERVICE_URL?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

function chatServiceToken(): string | null {
  const value =
    process.env.CHAT_INTERNAL_TOKEN?.trim() ?? process.env.EXEDRA_INTERNAL_TOKEN?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

export function setChatServiceClientForTests(client: ChatServiceClient | undefined): void {
  cachedClient = client;
}

export function getChatServiceClient(): ChatServiceClient {
  if (cachedClient !== undefined && cachedClient !== null) return cachedClient;

  const baseUrl = chatServiceUrl();
  const token = chatServiceToken();
  if (baseUrl !== null && token !== null) {
    cachedClient = createChatClient({ baseUrl, token });
    return cachedClient;
  }

  cachedClient = createTestChatClient();
  return cachedClient;
}

export function resetChatServiceClient(): void {
  cachedClient = undefined;
}
