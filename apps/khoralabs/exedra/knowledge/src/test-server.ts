import { getMemoriesSqliteDatabase } from "@khoralabs/memories-node/sqlite";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";

export type TestKnowledgeService = {
  baseUrl: string;
  dataDir: string;
  stop: () => void;
  listScopes: (database: MemoriesDatabaseId) => Promise<string[]>;
};

export function startTestKnowledgeService(dataDir: string): TestKnowledgeService {
  // Root test preload may load extension SQLite before SQLCipher configure; retry once
  // (same race as openTestMemoriesDatabase in memories-node).
  let stack: ReturnType<typeof createLocalSqliteServiceStack>;
  try {
    stack = createLocalSqliteServiceStack({
      dataDir,
      sqlCipherKey: process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim() ?? "test-knowledge-key",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/SQLite already loaded/i.test(msg)) throw e;
    stack = createLocalSqliteServiceStack({
      dataDir,
      sqlCipherKey: process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim() ?? "test-knowledge-key",
    });
  }
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
    async listScopes(database) {
      await stack.service.open(database);
      const handle = await stack.service.getHandle(database);
      const sync = handle.sync;
      if (sync === undefined) throw new Error("expected sqlite sync persistence");
      return getMemoriesSqliteDatabase(sync.syncPersistence)
        .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
        .all()
        .map((row) => row._id);
    },
  };
}
