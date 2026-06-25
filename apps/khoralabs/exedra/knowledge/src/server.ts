import { createAuthStrategyFromEnv } from "@khoralabs/memories-service-auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service-http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service-storage-sqlite";
import { serve } from "bun";

import {
  resolveKnowledgeDataDir,
  resolveKnowledgePort,
  resolveKnowledgeSqlCipherKey,
} from "./config";

const stack = createLocalSqliteServiceStack({
  dataDir: resolveKnowledgeDataDir(),
  sqlCipherKey: resolveKnowledgeSqlCipherKey(),
  maxCached: 8,
});

const auth = createAuthStrategyFromEnv();
const port = resolveKnowledgePort();

serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    return handleMemoriesServiceHttpRequest(req, {
      service: stack.service,
      ontology: stack.ontology,
      auth,
    });
  },
});

console.log(`knowledge service listening on ${port}`);
