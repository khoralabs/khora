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
  discoverMemoriesService,
  MEMORIES_ERROR_CODE,
  MEMORIES_HTTP_PATH,
  MemoriesServiceClient,
  MemoriesServiceClientError,
  type MemoriesServiceFetch,
} from "@khoralabs/memories-service/client";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";
import { KHORA_HOST_MEMORIES_DATABASE_ID } from "../services/memories";

function memoriesTest(name: string, fn: () => Promise<void>): void {
  test.skipIf(!memoriesSqliteVecAvailable())(name, fn);
}

describe("host memories-service smoke", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "khora-host-memories-"));

  afterAll(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  memoriesTest("getHandle + listNamespaces/getGraphLayout via service HTTP", async () => {
    const stack = createLocalSqliteServiceStack({ dataDir });
    const handle = await stack.service.getHandle(KHORA_HOST_MEMORIES_DATABASE_ID);
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
      database: KHORA_HOST_MEMORIES_DATABASE_ID,
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

  memoriesTest("health, discovery, and client error codes via MEMORIES_HTTP_PATH", async () => {
    const stack = createLocalSqliteServiceStack({ dataDir: `${dataDir}-boundary` });
    const fetchImpl: MemoriesServiceFetch = async (url, init) => {
      const req = new Request(url, init);
      return handleMemoriesServiceHttpRequest(req, {
        service: stack.service,
        auth: createNoneAuthStrategy(),
        ontology: stack.ontology,
        catalog: stack.catalog,
        discoveryAuthScheme: "none",
      });
    };

    const base = "http://localhost";
    const healthRes = await fetchImpl(`${base}${MEMORIES_HTTP_PATH.health}`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true });

    const doc = await discoverMemoriesService({
      baseUrl: base,
      fetch: fetchImpl,
      requireAuthScheme: "none",
    });
    expect(doc.version).toBe(1);
    expect(doc.endpoints.health).toBe(MEMORIES_HTTP_PATH.health);

    const client = new MemoriesServiceClient({ baseUrl: base, fetch: fetchImpl });
    try {
      await client.postJson("/no-such-route", {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MemoriesServiceClientError);
      expect((e as MemoriesServiceClientError).status).toBe(404);
      expect((e as MemoriesServiceClientError).code).toBe(MEMORIES_ERROR_CODE.not_found);
    }
  });
});
