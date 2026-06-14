import { serve } from "bun";
import index from "./client/index.html";
import { getDb } from "./server/db/index";
import { getStubRegistryOtp, isExedraStubRegistryEnabled } from "./server/registry-stub/config";
import { apiRoutes } from "./server/routes";
import { interviewWsHandlers, verifyInterviewWsUpgrade } from "./server/ws/interview";

getDb();

if (isExedraStubRegistryEnabled()) {
  console.log(
    `[exedra] stub registry enabled — /api/auth/* in-process; OTP ${getStubRegistryOtp()}`,
  );
}

const server = serve({
  routes: {
    ...apiRoutes,
    "/*": index,
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
    return undefined as unknown as Response;
  },

  websocket: interviewWsHandlers,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Exedra running at ${server.url}`);
