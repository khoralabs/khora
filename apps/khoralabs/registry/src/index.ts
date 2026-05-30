import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import { assertEncryptionKeys, EnvKeyProvider } from "@khoralabs/sqlite-crypto";
import {
  ensureRegistrySchema,
  getRegistryAuth,
  getRegistryDatabase,
  reloadRegistryAuth,
} from "@khoralabs/users-auth";
import { serve } from "bun";
import adminPage from "./admin-ui/routes/admin/index.html";
import adminLoginPage from "./admin-ui/routes/login/index.html";
import { handleAccessTokenRequest } from "./api/access-token";
import { routeConsoleAuth } from "./api/admin/console-guard";
import { handleAdminHostActivate, handleAdminHostCors } from "./api/admin/hosts";
import {
  handleInternalAdminStatsSummary,
  handleInternalLookupAccount,
  handleInternalLookupEmail,
} from "./api/admin/internal";
import { handleLookupAccount, handleLookupEmail } from "./api/admin/lookup";
import { handleAdminStatsSummary } from "./api/admin/stats";
import { handleDeviceApprove, handleDeviceAuthorize, handleDeviceToken } from "./api/device";
import {
  handleHostGet,
  handleHostRegister,
  handleHostsList,
  handleInternalHostActivate,
  handleInternalHostsList,
} from "./api/hosts";
import {
  handleLinkAgent,
  handleLinkAgentEnsure,
  handleLinkChallenge,
  handleLinkStatus,
  handleLinkUnlink,
} from "./api/link";
import { handleMarketingSubscribe, handleMarketingUnsubscribe } from "./api/marketing";
import { handleMe } from "./api/me";
import cliLinkPage from "./cli-link-ui/routes/link/index.html";
import { handleOptions, withCors } from "./cors";
import { startHostHealthPoller } from "./host-health.ts";
import { readRegistryTrustedOrigins } from "./trusted-origins.ts";

await assertEncryptionKeys(new EnvKeyProvider(), "registry");
await ensureRegistrySchema();
const registryDb = getRegistryDatabase();
reloadRegistryAuth({ trustedOrigins: readRegistryTrustedOrigins(registryDb) });
startHostHealthPoller(registryDb);

const auth = getRegistryAuth();
const rootToken = process.env.REGISTRY_CONSOLE_ROOT_TOKEN?.trim();
const consoleAuth =
  rootToken !== undefined && rootToken.length >= 16
    ? createRootTokenConsoleAuth({ rootToken })
    : null;

if (consoleAuth === null) {
  console.log("[registry] Admin console disabled (set REGISTRY_CONSOLE_ROOT_TOKEN to enable)");
} else {
  console.log("[registry] Admin console enabled at /admin");
}

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 4000,
  routes: {
    "/admin": adminPage,
    "/admin/": adminPage,
    "/admin/login": adminLoginPage,
    "/admin/login/": adminLoginPage,
    "/cli/link": cliLinkPage,
    "/cli/link/": cliLinkPage,
  },
  async fetch(req) {
    const options = handleOptions(req);
    if (options !== null) return options;

    const url = new URL(req.url);
    const path = url.pathname;

    const consoleRoute = await routeConsoleAuth(req, url, consoleAuth);
    if (consoleRoute !== undefined) {
      return withCors(req, consoleRoute);
    }

    if (path === "/health") {
      return withCors(req, Response.json({ ok: true }));
    }

    if (path === "/admin/api/stats/summary" && req.method === "GET") {
      return withCors(req, await handleAdminStatsSummary(req, consoleAuth));
    }

    if (path === "/admin/api/lookup/email" && req.method === "GET") {
      return withCors(req, await handleLookupEmail(req, url, consoleAuth));
    }

    if (path === "/admin/api/lookup/account" && req.method === "GET") {
      return withCors(req, await handleLookupAccount(req, url, consoleAuth));
    }

    if (
      path.startsWith("/admin/api/hosts/") &&
      path.endsWith("/activate") &&
      req.method === "POST"
    ) {
      const id = path.slice("/admin/api/hosts/".length, -"/activate".length);
      return withCors(req, await handleAdminHostActivate(req, consoleAuth, id));
    }

    if (path.startsWith("/admin/api/hosts/") && path.endsWith("/cors") && req.method === "PATCH") {
      const id = path.slice("/admin/api/hosts/".length, -"/cors".length);
      return withCors(req, await handleAdminHostCors(req, consoleAuth, id));
    }

    if (path === "/internal/admin/stats/summary" && req.method === "GET") {
      return handleInternalAdminStatsSummary(req);
    }

    if (path === "/internal/admin/lookup/email" && req.method === "GET") {
      return handleInternalLookupEmail(req, url);
    }

    if (path === "/internal/admin/lookup/account" && req.method === "GET") {
      return handleInternalLookupAccount(req, url);
    }

    if (path.startsWith("/api/auth")) {
      return withCors(req, await auth.handler(req));
    }

    if (path === "/v1/hosts" && req.method === "GET") {
      return withCors(req, handleHostsList());
    }

    if (path === "/v1/hosts/register" && req.method === "POST") {
      return withCors(req, await handleHostRegister(req));
    }

    if (path.startsWith("/v1/hosts/") && req.method === "GET") {
      const slug = path.slice("/v1/hosts/".length);
      if (slug.length > 0 && slug !== "register") {
        return withCors(req, handleHostGet(slug));
      }
    }

    if (path === "/internal/v1/hosts" && req.method === "GET") {
      return handleInternalHostsList(req);
    }

    if (
      path.startsWith("/internal/v1/hosts/") &&
      path.endsWith("/activate") &&
      req.method === "POST"
    ) {
      const id = path.slice("/internal/v1/hosts/".length, -"/activate".length);
      return await handleInternalHostActivate(req, id);
    }

    if (path === "/v1/me" && req.method === "GET") {
      return withCors(req, await handleMe(req));
    }

    if (path === "/v1/device/authorize" && req.method === "POST") {
      return withCors(req, await handleDeviceAuthorize(req));
    }

    if (path === "/v1/device/approve" && req.method === "POST") {
      return withCors(req, await handleDeviceApprove(req));
    }

    if (path === "/v1/device/token" && req.method === "POST") {
      return withCors(req, await handleDeviceToken(req));
    }

    if (path === "/v1/link/challenge" && req.method === "GET") {
      return withCors(req, await handleLinkChallenge(req, url));
    }

    if (path === "/v1/link/agent/ensure" && req.method === "POST") {
      return withCors(req, await handleLinkAgentEnsure(req));
    }

    if (path === "/v1/link/agent" && req.method === "POST") {
      return withCors(req, await handleLinkAgent(req));
    }

    if (path === "/v1/link/status" && req.method === "GET") {
      return withCors(req, await handleLinkStatus(req));
    }

    if (path === "/v1/link/agent" && req.method === "DELETE") {
      return withCors(req, await handleLinkUnlink(req));
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
