import {
  purgeEmptyPendingEmbeddings,
  readPendingEmbeddingQueueSummary,
  resetFailedPendingEmbeddings,
  runPendingEmbeddingRetryBatch,
} from "@khoralabs/khora-host";
import { type HostRouteDeps, jsonError, withAdminTokenAuth } from "@khoralabs/khora-server-http";
import {
  createSqliteGraphProjectionSource,
  getMemoriesSqliteDatabase,
} from "@khoralabs/memories-node/sqlite";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { envMemoriesEnabled } from "../memories-env";

const ADMIN_MEMORIES_PREFIX = "/admin/api/memories";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memoriesUnavailableResponse(): Response {
  return jsonError("Memories database is not configured on this host", 503);
}

function rewriteServiceRequest(req: Request, url: URL): Request {
  const rewritten = new URL(url.href);
  if (rewritten.pathname.startsWith(ADMIN_MEMORIES_PREFIX)) {
    const rest = rewritten.pathname.slice(ADMIN_MEMORIES_PREFIX.length);
    rewritten.pathname = rest.length === 0 ? "/" : rest;
  }
  return new Request(rewritten, req);
}

async function handleEmbeddingQueue(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  const subpath = url.pathname.slice(ADMIN_MEMORIES_PREFIX.length);
  const memories = deps.ctx.memories;
  const db = deps.memoriesSqliteDb;
  if (memories === undefined || db === undefined) {
    return memoriesUnavailableResponse();
  }

  if (req.method === "GET" && subpath === "/embedding-queue") {
    try {
      return jsonResponse(readPendingEmbeddingQueueSummary(db, { limit: 50 }));
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  if (req.method === "POST" && subpath === "/embedding-queue/retry-now") {
    try {
      const removedEmpty = purgeEmptyPendingEmbeddings(db);
      const resetFailed = resetFailedPendingEmbeddings(db);
      const result = await runPendingEmbeddingRetryBatch({
        db,
        persistence: memories.persistence,
        embeddingModel: memories.embeddingModel,
        ignoreBackoff: true,
        batchSize: 100,
      });
      return jsonResponse({
        ...result,
        removedEmpty: removedEmpty + result.removedEmpty,
        resetFailed,
      });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  return undefined;
}

async function handleMemoriesRoute(req: Request, url: URL, deps: HostRouteDeps): Promise<Response> {
  if (!envMemoriesEnabled()) {
    return memoriesUnavailableResponse();
  }
  if (deps.memoriesService === undefined || deps.ctx.memories === undefined) {
    return memoriesUnavailableResponse();
  }

  const queueRes = await handleEmbeddingQueue(req, url, deps);
  if (queueRes !== undefined) return queueRes;

  const serviceReq = rewriteServiceRequest(req, url);
  return handleMemoriesServiceHttpRequest(serviceReq, {
    service: deps.memoriesService,
    // Outer `/admin/api/memories` already passed {@link withAdminTokenAuth}.
    auth: createNoneAuthStrategy(),
    ...(deps.memoriesOntology !== undefined ? { ontology: deps.memoriesOntology } : {}),
    ...(deps.memoriesCatalog !== undefined ? { catalog: deps.memoriesCatalog } : {}),
    projectionSource: ({ handle }) => {
      const sync = handle.sync?.syncPersistence;
      if (sync === undefined) {
        throw new Error("Domus memories handle is missing sync SQLite persistence");
      }
      return createSqliteGraphProjectionSource(getMemoriesSqliteDatabase(sync));
    },
  });
}

export async function handleAdminMemoriesRoute(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, () => handleMemoriesRoute(req, url, deps));
}
