import "./otel.js";

import { createLogger } from "@khoralabs/observability/logger";
import { handleOptions, runWithRequestPeerIp, withCors } from "@khoralabs/registry/host";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { serve } from "bun";
import { handleMarketingSubscribe, handleMarketingUnsubscribe } from "./api/marketing";
import { bootstrapRegistryHost } from "./bootstrap-registry";
import { handleHealth, handleReady } from "./health";
import { tracer } from "./otel";
import cliLinkPage from "./routes/cli/link/index.html";

const logger = createLogger({ name: "khora-registry" });

const htmlRoutes = {
  "/cli/link": cliLinkPage,
  "/cli/link/": cliLinkPage,
};

const { host, identityRoutes } = await bootstrapRegistryHost();

if (process.env.REGISTRY_CONSOLE_ROOT_TOKEN === undefined) {
  logger.info("Operator API disabled (set REGISTRY_CONSOLE_ROOT_TOKEN to enable /v1/ops)");
} else {
  logger.info("Operator API enabled at /v1/ops (Bearer REGISTRY_CONSOLE_ROOT_TOKEN)");
}

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 4000,
  routes: htmlRoutes,
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
          const options = handleOptions(req);
          if (options !== null) {
            status = options.status;
            return options;
          }

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

          const identityRes = await identityRoutes.handle(req, path);
          if (identityRes !== null) {
            status = identityRes.status;
            span.setAttribute("registry.dispatch", "identity");
            return withCors(req, identityRes);
          }

          if (path === "/v1/marketing/subscribe") {
            if (req.method === "POST") {
              const res = await handleMarketingSubscribe(req);
              status = res.status;
              span.setAttribute("registry.dispatch", "marketing");
              return withCors(req, res);
            }
            if (req.method === "DELETE") {
              const res = await handleMarketingUnsubscribe(req);
              status = res.status;
              span.setAttribute("registry.dispatch", "marketing");
              return withCors(req, res);
            }
          }

          span.setAttribute("registry.dispatch", "host");
          const res = await host.fetch(req);
          status = res.status;
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
