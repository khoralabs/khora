import { ensureRegistrySchema, getRegistryAuth, getRegistryDatabase } from "@khoralabs/users-auth";
import { serve } from "bun";
import { handleAccessTokenRequest } from "./api/access-token";
import { handleMarketingSubscribe, handleMarketingUnsubscribe } from "./api/marketing";
import { handleMe } from "./api/me";
import { handleOptions, withCors } from "./cors";
import { seedDefaultHostFromEnv } from "./seed/default-host";

await ensureRegistrySchema();
seedDefaultHostFromEnv(getRegistryDatabase());

const auth = getRegistryAuth();
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 4000,
  async fetch(req) {
    const options = handleOptions(req);
    if (options !== null) return options;

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health") {
      return withCors(req, Response.json({ ok: true }));
    }

    if (path.startsWith("/api/auth")) {
      return withCors(req, await auth.handler(req));
    }

    if (path === "/v1/me" && req.method === "GET") {
      return withCors(req, await handleMe(req));
    }

    if (path === "/v1/access-token/request" && req.method === "POST") {
      return withCors(req, await handleAccessTokenRequest(req));
    }

    if (path === "/v1/marketing/subscribe") {
      if (req.method === "POST") {
        return withCors(req, await handleMarketingSubscribe(req));
      }
      if (req.method === "DELETE") {
        return withCors(req, await handleMarketingUnsubscribe(req));
      }
    }

    return withCors(req, Response.json({ error: "Not found" }, { status: 404 }));
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Registry running at ${server.url}`);
