import { runChatPersistenceContractTests } from "./contract.test.ts";
import { createMemoryChatPersistence } from "./memory-persistence.ts";

runChatPersistenceContractTests("memory", () => createMemoryChatPersistence());
