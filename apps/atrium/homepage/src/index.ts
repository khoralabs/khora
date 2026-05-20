import "./load-env.ts";
import { ensureAuthSchema } from "@khoralabs/atrium-console-auth";
import { serve } from "bun";
import { handleAdminStatsPrincipal, handleAdminStatsSummary } from "./api/admin-stats.ts";
import admin from "./routes/admin/index.html";
import index from "./routes/index.html";
import login from "./routes/login/index.html";

await ensureAuthSchema();

const { auth } = await import("@khoralabs/atrium-console-auth");

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/api/auth/*": (req) => auth.handler(req),
    "/api/admin/stats/summary": {
      GET: handleAdminStatsSummary,
    },
    "/api/admin/stats/principal": {
      GET: handleAdminStatsPrincipal,
    },
    "/login": login,
    "/login/": login,
    "/admin": admin,
    "/admin/": admin,
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
