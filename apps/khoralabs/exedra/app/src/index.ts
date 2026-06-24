import "./server/otel.js";

import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-sqlite";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { serve } from "bun";
import graphPage from "./client/routes/graph/index.html";
import index from "./client/routes/index.html";
import interviewPage from "./client/routes/interview/index.html";
import privacyPage from "./client/routes/privacy/index.html";
import termsPage from "./client/routes/terms/index.html";
import { getDb } from "./server/db/index";
import { logger } from "./server/logger";
import { tracer } from "./server/otel";
import { getStubRegistryOtp, isExedraStubRegistryEnabled } from "./server/registry-stub/config";
import { apiRoutes, internalRoutes } from "./server/routes";
import { serveAssets } from "./server/serve-assets";

// Must run before any bun:sqlite Database (including exedra.db) so sqlite-vec can load.
ensureCustomSqliteForExtensions();
getDb();

if (isExedraStubRegistryEnabled()) {
  logger.info({ otp: getStubRegistryOtp() }, "stub registry enabled — /api/auth/* in-process");
}

const server = serve({
  idleTimeout: 255,

  routes: {
    ...apiRoutes,
    ...internalRoutes,
    "/assets/*": { GET: serveAssets },
    "/sessions/:id/interview": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: interviewPage,
    },
    "/sessions/:id/interview/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: interviewPage,
    },
    "/sessions/:id/graph": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/sessions/:id/graph/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/teams/:teamId/graph": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/teams/:teamId/graph/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/me/graph": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/me/graph/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: graphPage,
    },
    "/terms": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: termsPage,
    },
    "/terms/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: termsPage,
    },
    "/privacy": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: privacyPage,
    },
    "/privacy/": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: privacyPage,
    },
    // GET-only so POST /api/* falls through to fetch dispatch below.
    "/*": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: index,
    },
  },

  async fetch(req, _bunServer) {
    const start = performance.now();
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/internal/")) {
      const span = tracer.startSpan(`HTTP ${req.method}`, {
        attributes: {
          "http.method": req.method,
          "http.target": url.pathname,
        },
      });

      try {
        const apiResponse = await context.with(trace.setSpan(context.active(), span), async () => {
          const { dispatchApiRoute } = await import("./server/dispatch-api");
          return dispatchApiRoute(req);
        });
        const status = apiResponse?.status ?? 404;
        span.setAttribute("http.status_code", status);
        if (status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
        if (apiResponse !== null) return apiResponse;
        return Response.json({ error: "Not found" }, { status: 404 });
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        span.end();
        logger.info(
          {
            method: req.method,
            path: url.pathname,
            durationMs: Math.round(performance.now() - start),
          },
          "request",
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

logger.info({ url: String(server.url) }, "Exedra running");
