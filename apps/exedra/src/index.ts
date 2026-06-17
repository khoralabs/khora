import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-sqlite";
import { serve } from "bun";
import graphPage from "./client/routes/graph/index.html";
import index from "./client/routes/index.html";
import interviewPage from "./client/routes/interview/index.html";
import { getDb } from "./server/db/index";
import { getStubRegistryOtp, isExedraStubRegistryEnabled } from "./server/registry-stub/config";
import { apiRoutes } from "./server/routes";
import { interviewWsHandlers, verifyInterviewWsUpgrade } from "./server/ws/interview";

// Must run before any bun:sqlite Database (including exedra.db) so sqlite-vec can load.
ensureCustomSqliteForExtensions();
getDb();

if (isExedraStubRegistryEnabled()) {
  console.log(
    `[exedra] stub registry enabled — /api/auth/* in-process; OTP ${getStubRegistryOtp()}`,
  );
}

const server = serve({
  routes: {
    ...apiRoutes,
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
    // GET-only so POST /api/* misses this route and reaches fetch dispatch below.
    "/*": {
      // @ts-expect-error Bun HTMLBundle handler
      GET: index,
    },
  },

  async fetch(req, bunServer) {
    const url = new URL(req.url);
    const wsMatch = /^\/ws\/interview\/([^/]+)\/?$/.exec(url.pathname);
    if (wsMatch !== null && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const threadId = wsMatch[1] ?? "";
      const verified = await verifyInterviewWsUpgrade(req, threadId);
      if (!verified.ok) {
        return new Response(verified.error, { status: verified.status });
      }
      const upgraded = bunServer.upgrade(req, { data: verified.data });
      if (upgraded) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    if (url.pathname.startsWith("/api/")) {
      const { dispatchApiRoute } = await import("./server/dispatch-api");
      const apiResponse = await dispatchApiRoute(req);
      if (apiResponse !== null) return apiResponse;
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: interviewWsHandlers,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Exedra running at ${server.url}`);
