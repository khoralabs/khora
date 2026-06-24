import { runChatPersistenceContractTests } from "@khoralabs/chat-persistence";
import { createTestChatDatabase } from "./index.ts";

runChatPersistenceContractTests("turso", async () => {
  const { persistence } = await createTestChatDatabase();
  return persistence;
});
