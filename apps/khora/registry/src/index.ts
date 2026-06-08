import { withCors } from "@khoralabs/registry-host";
import { serve } from "bun";
import { handleMarketingSubscribe, handleMarketingUnsubscribe } from "./api/marketing";
import { bootstrapRegistryHost } from "./bootstrap-registry";
import adminPage from "./routes/admin/index.html";
import adminLoginPage from "./routes/admin/login/index.html";
import cliLinkPage from "./routes/cli/link/index.html";

const htmlRoutes = {
  "/admin": adminPage,
  "/admin/": adminPage,
  "/admin/hosts": adminPage,
  "/admin/hosts/*": adminPage,
  "/admin/lookup": adminPage,
  "/admin/lookup/*": adminPage,
  "/admin/login": adminLoginPage,
  "/admin/login/": adminLoginPage,
  "/cli/link": cliLinkPage,
  "/cli/link/": cliLinkPage,
};

const { host, identityRoutes } = await bootstrapRegistryHost();

if (process.env.REGISTRY_CONSOLE_ROOT_TOKEN === undefined) {
  console.log("[registry] Admin console disabled (set REGISTRY_CONSOLE_ROOT_TOKEN to enable)");
} else {
  console.log("[registry] Admin console enabled at /admin");
}

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 4000,
  routes: htmlRoutes,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    const identityRes = await identityRoutes.handle(req, path);
    if (identityRes !== null) {
      return withCors(req, identityRes);
    }

    if (path === "/v1/marketing/subscribe") {
      if (req.method === "POST") {
        return withCors(req, await handleMarketingSubscribe(req));
      }
      if (req.method === "DELETE") {
        return withCors(req, await handleMarketingUnsubscribe(req));
      }
    }

    return host.fetch(req);
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Registry running at ${server.url}`);
