import { mkdirSync } from "node:fs";
import path from "node:path";

const { dirname } = path;

import { bootstrapKhoraEncryption } from "@khoralabs/khora-host/bootstrap";
import type { KhoraWsData } from "@khoralabs/khora-host/http";
import {
  createHostRouteDepsFromEnv,
  runWithRequestPeerIp,
  serveKhoraHttp,
} from "@khoralabs/khora-host/http";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { bootstrapKhoraHost } from "./bootstrap-khora";
import {
  envColonnadeUseCellWorkers,
  envHostDuplexIngress,
  envHostDuplexUnixPath,
  envHostUnaryIngress,
  envPort,
  envTenantKey,
  resolveKhoraPersistencePaths,
  validateEnv,
} from "./env";
import { logger } from "./logger";
import { tracer } from "./otel";
import { resolvePersistenceCwd } from "./packaged-runtime";
import { envMemoriesBootstrapConfig } from "./services/memories";

/**
 * Boot the HTTP/WS host and block until SIGTERM/SIGINT.
 * Call {@link applyPackagedRuntimeDefaults} (and OTel env defaults) before importing this module
 * when running from the compiled entry.
 */
export async function runHttpServer(): Promise<void> {
  const appRoot = resolvePersistenceCwd();

  validateEnv(appRoot);

  const persistencePaths = resolveKhoraPersistencePaths(process.env, appRoot);
  const { hostDbPath, authNoncesDbPath, percolatorDbPath, cellsDir, dataDir } = persistencePaths;
  const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(dirname(hostDbPath), { recursive: true });
  mkdirSync(dirname(authNoncesDbPath), { recursive: true });
  mkdirSync(dirname(percolatorDbPath), { recursive: true });
  mkdirSync(cellsDir, { recursive: true });
  if (memoriesConfig !== undefined) {
    mkdirSync(memoriesConfig.memoriesDataDir, { recursive: true });
  }

  const tenantKey = envTenantKey();
  const encryption = await bootstrapKhoraEncryption();
  const { ctx } = await bootstrapKhoraHost({
    hostDbPath,
    authNoncesDbPath,
    percolatorDbPath,
    cellsDir,
    useCellWorkers: envColonnadeUseCellWorkers(),
    encryption,
    ...(tenantKey !== undefined ? { tenantKey } : {}),
    ...(memoriesConfig !== undefined ? { memories: memoriesConfig } : {}),
  });

  const { deps, adminTokenAuthEnabled } = createHostRouteDepsFromEnv({ ctx });

  if (!adminTokenAuthEnabled) {
    logger.info(
      "Operator API disabled (set ADMIN_ROOT_TOKEN / KHORA_CONSOLE_ROOT_TOKEN to enable)",
    );
  } else {
    logger.info("Operator API enabled at /v1/ops and /v1/host/registry (Bearer root token)");
  }

  const unaryIngress = envHostUnaryIngress();
  const duplexMode = envHostDuplexIngress();

  await serveKhoraHttp({
    deps,
    port: envPort(),
    logger,
    ...(unaryIngress === "stdio" ? { unaryIngress: "stdio" as const } : {}),
    ...(duplexMode === "unix" ? { duplexUnixPath: envHostDuplexUnixPath() } : {}),
    onListening: ({ port }) => {
      logger.info({ port }, "listening");
    },
    fetch: async (req, srv, { route, deps: routeDeps }) => {
      const peerIp = srv.requestIP(req)?.address ?? null;
      return runWithRequestPeerIp(peerIp, async () => {
        const startMs = Date.now();
        const url = new URL(req.url);
        const span = tracer.startSpan(`HTTP ${req.method}`, {
          attributes: { "http.method": req.method, "http.target": url.pathname },
        });
        return context.with(trace.setSpan(context.active(), span), async () => {
          let status = 200;
          try {
            const res = await route(req, url, srv as Bun.Server<KhoraWsData>, routeDeps);
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
      });
    },
  });
}
