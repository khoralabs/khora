import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSqliteGraphProjectionSource,
  getMemoriesSqliteDatabase,
  memoriesSqliteVecAvailable,
} from "@khoralabs/memories-node/sqlite";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import {
  createRemoteMemoriesReadClient,
  type MemoriesServiceFetch,
} from "@khoralabs/memories-service/client";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";
import { KHORA_DOMUS_MEMORIES_DATABASE_ID } from "../memories-domus";

function memoriesTest(name: string, fn: () => Promise<void>): void {
  test.skipIf(!memoriesSqliteVecAvailable())(name, fn);
}

describe("Domus memories-service smoke", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "khora-domus-memories-"));

  afterAll(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  memoriesTest("getHandle + listNamespaces/getGraphLayout via service HTTP", async () => {
    const stack = createLocalSqliteServiceStack({ dataDir });
    const handle = await stack.service.getHandle(KHORA_DOMUS_MEMORIES_DATABASE_ID);
    expect(handle.persistence).toBeDefined();
    expect(handle.sync?.syncPersistence).toBeDefined();

    const fetchImpl: MemoriesServiceFetch = async (url, init) => {
      const req = new Request(url, init);
      return handleMemoriesServiceHttpRequest(req, {
        service: stack.service,
        auth: createNoneAuthStrategy(),
        ontology: stack.ontology,
        catalog: stack.catalog,
        projectionSource: ({ handle: h }) => {
          const sync = h.sync?.syncPersistence;
          if (sync === undefined) {
            throw new Error("missing sync sqlite persistence");
          }
          return createSqliteGraphProjectionSource(getMemoriesSqliteDatabase(sync));
        },
      });
    };

    const reads = createRemoteMemoriesReadClient({
      baseUrl: "http://localhost",
      database: KHORA_DOMUS_MEMORIES_DATABASE_ID,
      fetch: fetchImpl,
    });

    const namespaces = await reads.listNamespaces();
    expect(Array.isArray(namespaces)).toBe(true);

    const layout = await reads.getGraphLayout({
      namespace: "global",
      scope: "subtree",
    });
    expect(layout.namespace).toBe("global");
    expect(Array.isArray(layout.nodes)).toBe(true);
    expect(Array.isArray(layout.edges)).toBe(true);

    await handle.close();
  });
});
