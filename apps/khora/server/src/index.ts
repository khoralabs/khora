import "./otel.js";

import { mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";

const { dirname } = path;

import { createAdminTokenAuthFromEnv } from "@khoralabs/admin-token";
import {
  createHostRouter,
  createInboxDrainWebSocketHandlers,
  createV2HostRateLimiters,
  type HostRouteDeps,
  startDuplexUnixIngress,
  startStdioUnaryIngress,
} from "@khoralabs/khora-server-http";
import type { KhoraWsData } from "@khoralabs/khora-transport";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { bootstrapKhoraHost } from "./bootstrap-khora";
import { bootstrapKhoraEncryption } from "./encryption-bootstrap";
import {
  envCellPoolCount,
  envColonnadeUseCellWorkers,
  envHostDuplexIngress,
  envHostDuplexUnixPath,
  envHostUnaryIngress,
  envPort,
  envTenantKey,
  resolveKhoraPersistencePaths,
  validateEnv,
} from "./env";
import { handleAdminMemoriesRoute } from "./http/admin-memories";
import { logger } from "./logger";
import { envMemoriesBootstrapConfig } from "./memories-env";
import { tracer } from "./otel";

/** App root (parent of `src/` or `dist/`) — not `process.cwd()` when prod runs from `dist/`. */
const appRoot = path.resolve(import.meta.dir, "..");

validateEnv(appRoot);

const persistencePaths = resolveKhoraPersistencePaths(process.env, appRoot);
const { hostDbPath, authNoncesDbPath, percolatorDbPath, cellsDir, dataDir } = persistencePaths;
const cellPoolCount = envCellPoolCount();
const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);
mkdirSync(dataDir, { recursive: true });
mkdirSync(dirname(hostDbPath), { recursive: true });
mkdirSync(dirname(authNoncesDbPath), { recursive: true });
mkdirSync(dirname(percolatorDbPath), { recursive: true });
mkdirSync(cellsDir, { recursive: true });
if (memoriesConfig !== undefined) {
  mkdirSync(dirname(memoriesConfig.dbPath), { recursive: true });
}

const tenantKey = envTenantKey();
const encryption = await bootstrapKhoraEncryption();
const { ctx, memoriesSqliteDb } = await bootstrapKhoraHost({
  hostDbPath,
  authNoncesDbPath,
  percolatorDbPath,
  cellsDir,
  cellPoolCount,
  useCellWorkers: envColonnadeUseCellWorkers(),
  encryption,
  ...(tenantKey !== undefined ? { tenantKey } : {}),
  ...(memoriesConfig !== undefined ? { memories: memoriesConfig } : {}),
});

const adminTokenAuth = createAdminTokenAuthFromEnv();
if (adminTokenAuth === null) {
  logger.info("Admin token auth disabled (set ADMIN_ROOT_TOKEN to enable)");
} else {
  logger.info("Admin API enabled at /admin/api (serve HTML via @khoralabs/khora-admin)");
}

const deps: HostRouteDeps = {
  ctx,
  ...(memoriesSqliteDb !== undefined ? { memoriesSqliteDb } : {}),
  rateLimiters: createV2HostRateLimiters(),
  adminTokenAuth,
};
const { route } = createHostRouter({
  adminMemoriesRoute: handleAdminMemoriesRoute,
  hostSpec: ctx.hostSpec,
});
const inboxWsHandlers = createInboxDrainWebSocketHandlers({ ctx });

const server = Bun.serve<KhoraWsData>({
  port: envPort(),
  async fetch(req) {
    const startMs = Date.now();
    const url = new URL(req.url);
    const span = tracer.startSpan(`HTTP ${req.method}`, {
      attributes: { "http.method": req.method, "http.target": url.pathname },
    });
    return context.with(trace.setSpan(context.active(), span), async () => {
      let status = 200;
      try {
        const res = await route(req, url, server, deps);
        status = res?.status ?? 404;
        return res ?? new Response("Not found", { status: 404 });
      } catch (err) {
        status = 500;
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ err }, "unhandled fetch error");
        return new Response("Internal server error", { status: 500 });
      } finally {
        span.setAttribute("http.status_code", status);
        span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
        span.end();
        logger.info(
          { method: req.method, path: url.pathname, status, durationMs: Date.now() - startMs },
          "request",
        );
      }
    });
  },
  websocket: inboxWsHandlers,
});

logger.info({ port: server.port }, "listening");

const unaryIngress = envHostUnaryIngress();
if (unaryIngress === "stdio") {
  logger.info("Unary ingress: stdio (NDJSON lines); parallel to HTTP.");
  void startStdioUnaryIngress(deps).catch((e) => {
    logger.fatal({ err: e }, "stdio unary ingress failed");
    process.exit(1);
  });
}

let duplexIngress: ReturnType<typeof startDuplexUnixIngress> | undefined;
const duplexMode = envHostDuplexIngress();
if (duplexMode === "unix") {
  const duplexUnixPath = envHostDuplexUnixPath();
  mkdirSync(dirname(duplexUnixPath), { recursive: true });
  try {
    unlinkSync(duplexUnixPath);
  } catch {
    /* stale socket may not exist */
  }
  duplexIngress = startDuplexUnixIngress({ deps, unixPath: duplexUnixPath });
}

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "draining and shutting down");

  setTimeout(() => {
    logger.error("shutdown timeout; forcing exit");
    process.exit(1);
  }, 10_000).unref();

  try {
    ctx.principalTeardownWorker.stop();
  } catch {
    /* ignore */
  }
  try {
    ctx.cluster.close();
  } catch {
    /* ignore */
  }
  try {
    ctx.memories?.close();
  } catch {
    /* ignore */
  }
  try {
    server.stop(false);
  } catch {
    /* already stopped */
  }
  try {
    duplexIngress?.stop(true);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandledRejection");
  process.exit(1);
});
