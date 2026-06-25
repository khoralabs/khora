export {
  startTestKnowledgeService,
  type TestKnowledgeService,
} from "@khoralabs/exedra-knowledge/test-server";

import path from "node:path";
import { startTestKnowledgeService } from "@khoralabs/exedra-knowledge/test-server";

export function setupTestKnowledgeService(dataDir: string) {
  process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY =
    process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim() ?? "test-knowledge-key";
  return startTestKnowledgeService(path.join(dataDir, "knowledge"));
}
