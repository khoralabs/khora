import { handleRegistryRequest, runWithRequestPeerIp } from "@khoralabs/khora-registry/host";
import { createLogger } from "@khoralabs/observability/logger";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { serve } from "bun";
import { bootstrapRegistryHost } from "./bootstrap-registry";
import { handleHealth, handleReady } from "./health";
import type { registryHtmlRoutes } from "./html-routes";
import { tracer } from "./otel";

const logger = createLogger({ name: "khora-registry" });

export type RunRegistryServerOptions = {
  htmlRoutes?: typeof registryHtmlRoutes;
};

/**
 * Boot the registry HTTP server and block until SIGTERM/SIGINT.
 * Call {@link applyPackagedRuntimeDefaults} (and OTel env defaults) before importing this module
 * when running from the compiled entry.
 */
export async function runRegistryServer(opts: RunRegistryServerOptions = {}): Promise<void> {
  const { host, identityRoutes } = await bootstrapRegistryHost();

  if (process.env.REGISTRY_CONSOLE_ROOT_TOKEN === undefined) {
    logger.info("Operator API disabled (set REGISTRY_CONSOLE_ROOT_TOKEN to enable /v1/ops)");
  } else {
    logger.info("Operator API enabled at /v1/ops (Bearer REGISTRY_CONSOLE_ROOT_TOKEN)");
  }

  const port = Number.parseInt(process.env.PORT ?? "4000", 10);

  const server = serve({
    port: Number.isFinite(port) ? port : 4000,
    ...(opts.htmlRoutes !== undefined ? { routes: opts.htmlRoutes } : {}),
    async fetch(req, srv) {
      const peerIp = srv.requestIP(req)?.address ?? null;
      return runWithRequestPeerIp(peerIp, async () => {
        const startMs = Date.now();
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;

        const span = tracer.startSpan(`HTTP ${method}`, {
          attributes: {
            "http.method": method,
            "http.target": path,
          },
        });

        return context.with(trace.setSpan(context.active(), span), async () => {
          let status = 200;
          try {
            if (path === "/health") {
              const res = handleHealth();
              status = res.status;
              return res;
            }

            if (path === "/ready") {
              const res = handleReady();
              status = res.status;
              return res;
            }

            const res = await handleRegistryRequest(req, { host, identityRoutes });
            status = res.status;
            if (
              path.startsWith("/api/auth") ||
              path.startsWith("/v1/device") ||
              path.startsWith("/agent/auth") ||
              path.startsWith("/.well-known/")
            ) {
              span.setAttribute("registry.dispatch", "identity");
            } else {
              span.setAttribute("registry.dispatch", "host");
            }
            return res;
          } catch (err) {
            status = 500;
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          } finally {
            span.setAttribute("http.status_code", status);
            span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
            span.end();
            logger.info({ method, path, status, durationMs: Date.now() - startMs }, "request");
          }
        });
      });
    },
    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  logger.info(`Registry running at ${server.url}`);

  await new Promise<void>((resolve, reject) => {
    function shutdown(sig: NodeJS.Signals) {
      logger.info({ sig }, "shutting down");
      try {
        server.stop(false);
      } catch {
        /* already stopped */
      }
      // Resolve so start-registry.ts can flush Litestream in its finally block.
      resolve();
    }

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));

    process.on("uncaughtException", (err) => {
      logger.fatal({ err }, "uncaughtException");
      reject(err);
    });

    process.on("unhandledRejection", (reason) => {
      logger.fatal({ reason }, "unhandledRejection");
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    });
  });
}
