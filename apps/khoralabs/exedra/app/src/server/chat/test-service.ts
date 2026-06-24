import {
  type ChatServiceClient,
  closeChatDb,
  createChatClient,
  createChatRoutesWithParams,
  dispatchChatRoute,
  getChatService,
  subscribeToChatThread,
} from "@khoralabs/exedra-chat";

import { resetChatServiceClient, setChatServiceClientForTests } from "./service-client";

const TEST_TOKEN = "test-internal-token";

export function createTestChatClient(): ChatServiceClient {
  const service = getChatService();
  const routes = createChatRoutesWithParams(service, TEST_TOKEN);
  return createChatClient({
    baseUrl: "http://chat.test",
    token: TEST_TOKEN,
    fetchFn: (req, init) => {
      const request =
        req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
      return dispatchChatRoute(routes, request);
    },
    subscribeToThread: (threadId, handler) => subscribeToChatThread(threadId, handler),
  });
}

export function installTestChatService(): ChatServiceClient {
  const client = createTestChatClient();
  setChatServiceClientForTests(client);
  return client;
}

export function uninstallTestChatService(): void {
  closeChatDb();
  resetChatServiceClient();
}
