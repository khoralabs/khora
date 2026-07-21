import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";

import { startTestKnowledgeService } from "./test-server";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe("knowledge service", () => {
  test("startTestKnowledgeService exposes health and database list", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "exedra-knowledge-test-"));
    tempDirs.push(dataDir);
    process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY = "test-knowledge-key";

    const service = startTestKnowledgeService(dataDir);
    try {
      const health = await fetch(`${service.baseUrl}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });

      const stack = createLocalSqliteServiceStack({
        dataDir,
        sqlCipherKey: "test-knowledge-key",
      });
      const listRes = await handleMemoriesServiceHttpRequest(
        new Request(`${service.baseUrl}/databases`),
        {
          service: stack.service,
          ontology: stack.ontology,
          auth: createNoneAuthStrategy(),
        },
      );
      expect(listRes.status).toBe(200);
      expect(await listRes.json()).toEqual({ databases: [] });
    } finally {
      service.stop();
      delete process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY;
    }
  });
});
