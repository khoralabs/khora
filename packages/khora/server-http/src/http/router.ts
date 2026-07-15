import type { KhoraWsUpgradePort } from "@khoralabs/khora-transport";
import { logger } from "../logger";
import { clientIpFromRequest } from "../rate-limit";
import { handleInboxWsUpgrade } from "../ws/inbox";
import { handleAdminAgentsRoute } from "./admin-agents";
import { handleAdminInvitesList, handleAdminInvitesMint } from "./admin-invites";
import {
  handleAdminStatsCell,
  handleAdminStatsInactiveMembers,
  handleAdminStatsPrincipal,
  handleAdminStatsSummary,
} from "./admin-stats";
import { routeAdminTokenAuth } from "./admin-token-guard";
import { handleListAuthorSubscriptions } from "./authors";
import type { HostRouteDeps } from "./deps";
import { handleHealth, handleReady } from "./health";
import { handleAdminHostConfigGet, handleAdminHostConfigPatch } from "./host-admin";
import { handleInvitePreview, handleListInvites } from "./invites";
import {
  handleAgentStatus,
  handleCreatePost,
  handleDeletePost,
  handleGetPost,
  handleUpdatePost,
} from "./posts";
import { handleProfileByDid, handleProfileByUsername, handleProfilePatch } from "./profile";
import { handleRegister } from "./register";
import {
  handleAdminRegistryClaimPost,
  handleAdminRegistryConfigPut,
  handleAdminRegistryGet,
  handleAdminRegistryOriginDelete,
  handleAdminRegistryOriginRequestDelete,
  handleAdminRegistryOriginRequestPost,
  handleAdminRegistryQuotaRequestDelete,
  handleAdminRegistryQuotaRequestPost,
  handleAdminRegistryRegisterPost,
} from "./registry-admin";
import { jsonError, rateLimitedResponse } from "./responses";
import { handleSearchGet, handleSearchPost } from "./search";
import { handleUnregister } from "./unregister";
import { handleWellKnownKhora } from "./well-known-khora";

export type AdminMemoriesRoute = (
  req: Request,
  url: URL,
  deps: HostRouteDeps,
) => Promise<Response | undefined>;

export type CreateHostRouterOptions = {
  /** App-provided; when omitted, /admin/api/memories returns 404. */
  adminMemoriesRoute?: AdminMemoriesRoute;
};

export type HostRouter = {
  route: (
    req: Request,
    url: URL,
    upgradePort: KhoraWsUpgradePort | undefined,
    deps: HostRouteDeps,
  ) => Promise<Response | undefined>;
  routeUnary: (req: Request, url: URL, deps: HostRouteDeps) => Promise<Response | undefined>;
};

/**
 * Match `req` + `url` against khora HTTP routes. Pass **`upgradePort`** for WebSocket upgrade; omit for unary-only ingress.
 */
export function createHostRouter(opts: CreateHostRouterOptions = {}): HostRouter {
  async function route(
    req: Request,
    url: URL,
    upgradePort: KhoraWsUpgradePort | undefined,
    deps: HostRouteDeps,
  ): Promise<Response | undefined> {
    if (req.method === "GET" && url.pathname === "/health") {
      return handleHealth();
    }

    if (req.method === "GET" && url.pathname === "/.well-known/khora") {
      return handleWellKnownKhora(deps);
    }

    if (req.method === "GET" && url.pathname === "/ready") {
      return handleReady(deps);
    }

    if (url.pathname.startsWith("/internal/")) {
      return jsonError("Not found", 404);
    }

    const consoleRoute = await routeAdminTokenAuth(req, url, deps.adminTokenAuth);
    if (consoleRoute !== undefined) return consoleRoute;

    if (req.method === "GET" && url.pathname === "/admin/api/stats/summary") {
      return handleAdminStatsSummary(req, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/stats/principal") {
      return handleAdminStatsPrincipal(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/stats/cell") {
      return handleAdminStatsCell(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/stats/inactive-members") {
      return handleAdminStatsInactiveMembers(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/registry") {
      return handleAdminRegistryGet(req, deps);
    }

    if (req.method === "PUT" && url.pathname === "/admin/api/registry/config") {
      return handleAdminRegistryConfigPut(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/admin/api/registry/register") {
      return handleAdminRegistryRegisterPost(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/admin/api/registry/claim") {
      return handleAdminRegistryClaimPost(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/admin/api/registry/origin-requests") {
      return handleAdminRegistryOriginRequestPost(req, deps);
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith("/admin/api/registry/origin-requests/")
    ) {
      const requestId = url.pathname.slice("/admin/api/registry/origin-requests/".length);
      if (requestId.length > 0) {
        return handleAdminRegistryOriginRequestDelete(req, deps, requestId);
      }
    }

    if (req.method === "POST" && url.pathname === "/admin/api/registry/quota-requests") {
      return handleAdminRegistryQuotaRequestPost(req, deps);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/admin/api/registry/quota-requests/")) {
      const requestId = url.pathname.slice("/admin/api/registry/quota-requests/".length);
      if (requestId.length > 0) {
        return handleAdminRegistryQuotaRequestDelete(req, deps, requestId);
      }
    }

    if (req.method === "DELETE" && url.pathname === "/admin/api/registry/origins") {
      return handleAdminRegistryOriginDelete(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/admin/api/invites/mint") {
      return handleAdminInvitesMint(req, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/invites") {
      return handleAdminInvitesList(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/admin/api/host/config") {
      return handleAdminHostConfigGet(req, deps);
    }

    if (req.method === "PATCH" && url.pathname === "/admin/api/host/config") {
      return handleAdminHostConfigPatch(req, deps);
    }

    if (url.pathname.startsWith("/admin/api/memories")) {
      if (opts.adminMemoriesRoute !== undefined) {
        return opts.adminMemoriesRoute(req, url, deps);
      }
      return jsonError("Not found", 404);
    }

    if (url.pathname.startsWith("/admin/api/agents/")) {
      return handleAdminAgentsRoute(req, url, deps);
    }

    const ip = clientIpFromRequest(req);
    const ipRl = deps.rateLimiters.defaultIp(`ip:${ip}`);
    if (!ipRl.ok) {
      logger.warn({ ip }, "default ip rate limit exceeded");
      return rateLimitedResponse(ipRl.retryAfterSec);
    }

    if (req.method === "POST" && url.pathname === "/v1/register") {
      return handleRegister(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/v1/unregister") {
      return handleUnregister(req, deps);
    }

    if (req.method === "POST" && url.pathname === "/v1/search") {
      return handleSearchPost(req, deps);
    }

    if (req.method === "GET" && url.pathname === "/v1/search") {
      return handleSearchGet(req, url, deps);
    }

    if (req.method === "POST" && url.pathname === "/v1/invite/preview") {
      return handleInvitePreview(req, deps);
    }

    if (req.method === "GET" && url.pathname === "/v1/invites") {
      return handleListInvites(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/v1/authors/subscriptions") {
      return handleListAuthorSubscriptions(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/v1/inbox/ws") {
      if (upgradePort === undefined) {
        return jsonError("WebSocket upgrade requires HTTP transport", 501);
      }
      return handleInboxWsUpgrade(req, url, upgradePort, deps);
    }

    if (req.method === "PATCH" && url.pathname === "/v1/profile") {
      return handleProfilePatch(req, url, deps);
    }

    const byDid = /^\/v1\/profile\/by-did\/(.+)$/.exec(url.pathname);
    if (req.method === "GET" && byDid !== null && byDid[1] !== undefined) {
      return handleProfileByDid(req, url, deps, decodeURIComponent(byDid[1]));
    }

    const byUser = /^\/v1\/profile\/by-username\/(.+)$/.exec(url.pathname);
    if (req.method === "GET" && byUser !== null && byUser[1] !== undefined) {
      return handleProfileByUsername(req, url, deps, byUser[1]);
    }

    if (req.method === "POST" && url.pathname === "/v1/posts") {
      return handleCreatePost(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === "/v1/agent/status") {
      return handleAgentStatus(req, url, deps);
    }

    const postIdMatch = /^\/v1\/posts\/([^/]+)$/.exec(url.pathname);
    if (postIdMatch !== null && postIdMatch[1] !== undefined) {
      const id = decodeURIComponent(postIdMatch[1]);
      if (req.method === "GET") {
        return handleGetPost(req, url, deps, id);
      }
      if (req.method === "PATCH") {
        return handleUpdatePost(req, url, deps, id);
      }
      if (req.method === "DELETE") {
        return handleDeletePost(req, url, deps, id);
      }
    }

    return undefined;
  }

  return {
    route,
    routeUnary: (req, url, deps) => route(req, url, undefined, deps),
  };
}

const defaultRouter = createHostRouter();

/** Default router with no admin-memories handler (404). Prefer {@link createHostRouter}. */
export const route = defaultRouter.route;
export const routeUnary = defaultRouter.routeUnary;
