import { runChatPersistenceContractTests } from "@khoralabs/chat-persistence";
import { createChatDatabase, createSqliteChatPersistence } from "./index.ts";

runChatPersistenceContractTests("sqlite", () => {
  const db = createChatDatabase(":memory:");
  return createSqliteChatPersistence(db);
});
