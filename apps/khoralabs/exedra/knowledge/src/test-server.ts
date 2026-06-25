import { createNoneAuthStrategy } from "@khoralabs/memories-service-auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service-http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service-storage-sqlite";

export type TestKnowledgeService = {
  baseUrl: string;
  dataDir: string;
  stop: () => void;
};

export function startTestKnowledgeService(dataDir: string): TestKnowledgeService {
  const stack = createLocalSqliteServiceStack({
    dataDir,
    sqlCipherKey:
      process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim() ??
      process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY?.trim() ??
      "test-knowledge-key",
  });
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      return handleMemoriesServiceHttpRequest(req, {
        service: stack.service,
        ontology: stack.ontology,
        auth: createNoneAuthStrategy(),
      });
    },
  });
  const baseUrl = `http://localhost:${server.port}`;
  process.env.EXEDRA_KNOWLEDGE_SERVICE_URL = baseUrl;
  delete process.env.EXEDRA_KNOWLEDGE_SERVICE_TOKEN;
  return {
    baseUrl,
    dataDir,
    stop: () => {
      server.stop(true);
      delete process.env.EXEDRA_KNOWLEDGE_SERVICE_URL;
    },
  };
}
