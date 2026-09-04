import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraHostSpecPort } from "../..";
import { logger } from "../logger";
import { clientIpFromRequest } from "../rate-limit";
import { maybeRegistryOptInOnStartup } from "../registry-opt-in";
import { handleInboxWsUpgrade } from "../ws/inbox";
import type { KhoraWsUpgradePort } from "../ws/types";
import { handleListAuthorSubscriptions } from "./authors";
import type { HostRouteDeps } from "./deps";
import { handleHealth, handleReady } from "./health";
import { handleInvitePreview, handleListInvites } from "./invites";
import { handleAdminAgentsRoute } from "./ops-agents";
import { handleAdminHostConfigGet, handleAdminHostConfigPatch } from "./ops-host-config";
import { handleAdminInvitesList, handleAdminInvitesMint } from "./ops-invites";
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
} from "./registry-ops";
import { jsonError, rateLimitedResponse } from "./responses";
import { handleSearchGet, handleSearchPost } from "./search";
import { handleUnregister } from "./unregister";
import { handleWellKnownKhora } from "./well-known-khora";

export type CreateHostRouterOptions = {
  /**
   * When set, runs env-gated registry opt-in once at router creation
   * ({@link maybeRegistryOptInOnStartup}).
   */
  hostSpec?: KhoraHostSpecPort;
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
  if (opts.hostSpec !== undefined) {
    maybeRegistryOptInOnStartup(opts.hostSpec);
  }

  async function route(
    req: Request,
    url: URL,
    upgradePort: KhoraWsUpgradePort | undefined,
    deps: HostRouteDeps,
  ): Promise<Response | undefined> {
    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.health) {
      return handleHealth();
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.wellKnown) {
      return handleWellKnownKhora(deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.ready) {
      return handleReady(deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.hostRegistry) {
      return handleAdminRegistryGet(req, deps);
    }

    if (req.method === "PUT" && url.pathname === KHORA_HTTP_PATH.hostRegistryConfig) {
      return handleAdminRegistryConfigPut(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.hostRegistryRegister) {
      return handleAdminRegistryRegisterPost(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.hostRegistryClaim) {
      return handleAdminRegistryClaimPost(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.hostRegistryOriginRequests) {
      return handleAdminRegistryOriginRequestPost(req, deps);
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith(`${KHORA_HTTP_PATH.hostRegistryOriginRequests}/`)
    ) {
      const requestId = url.pathname.slice(`${KHORA_HTTP_PATH.hostRegistryOriginRequests}/`.length);
      if (requestId.length > 0) {
        return handleAdminRegistryOriginRequestDelete(req, deps, requestId);
      }
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.hostRegistryQuotaRequests) {
      return handleAdminRegistryQuotaRequestPost(req, deps);
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith(`${KHORA_HTTP_PATH.hostRegistryQuotaRequests}/`)
    ) {
      const requestId = url.pathname.slice(`${KHORA_HTTP_PATH.hostRegistryQuotaRequests}/`.length);
      if (requestId.length > 0) {
        return handleAdminRegistryQuotaRequestDelete(req, deps, requestId);
      }
    }

    if (req.method === "DELETE" && url.pathname === KHORA_HTTP_PATH.hostRegistryOrigins) {
      return handleAdminRegistryOriginDelete(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.opsInvitesMint) {
      return handleAdminInvitesMint(req, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.opsInvites) {
      return handleAdminInvitesList(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.opsHostConfig) {
      return handleAdminHostConfigGet(req, deps);
    }

    if (req.method === "PATCH" && url.pathname === KHORA_HTTP_PATH.opsHostConfig) {
      return handleAdminHostConfigPatch(req, deps);
    }

    if (url.pathname.startsWith(KHORA_HTTP_PATH.opsAgentsPrefix)) {
      return handleAdminAgentsRoute(req, url, deps);
    }

    const ip = clientIpFromRequest(req);
    const ipRl = deps.rateLimiters.defaultIp(`ip:${ip}`);
    if (!ipRl.ok) {
      logger.warn({ ip }, "default ip rate limit exceeded");
      return rateLimitedResponse(ipRl.retryAfterSec);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.register) {
      return handleRegister(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.unregister) {
      return handleUnregister(req, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.search) {
      return handleSearchPost(req, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.search) {
      return handleSearchGet(req, url, deps);
    }

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.invitePreview) {
      return handleInvitePreview(req, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.invites) {
      return handleListInvites(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.authorsSubscriptions) {
      return handleListAuthorSubscriptions(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.inboxWs) {
      if (upgradePort === undefined) {
        return jsonError("WebSocket upgrade requires HTTP transport", 501);
      }
      return handleInboxWsUpgrade(req, url, upgradePort, deps);
    }

    if (req.method === "PATCH" && url.pathname === KHORA_HTTP_PATH.profile) {
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

    if (req.method === "POST" && url.pathname === KHORA_HTTP_PATH.posts) {
      return handleCreatePost(req, url, deps);
    }

    if (req.method === "GET" && url.pathname === KHORA_HTTP_PATH.agentStatus) {
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

/** Default router. Prefer {@link createHostRouter}. */
export const route = defaultRouter.route;
export const routeUnary = defaultRouter.routeUnary;
