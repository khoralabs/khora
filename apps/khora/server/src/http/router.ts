import { agentRelayFrameChannelWebSocketHandlers } from "@khoralabs/agent-relay";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import type { KhoraWsUpgradePort } from "@khoralabs/khora-transport";
import { logger } from "../logger";
import { clientIpFromRequest } from "../rate-limit";
import { handleInboxWsUpgrade } from "../ws/inbox";
import {
  handleAdminStatsCell,
  handleAdminStatsInactiveMembers,
  handleAdminStatsPrincipal,
  handleAdminStatsSummary,
} from "./admin-stats";
import { handleListAuthorSubscriptions } from "./authors";
import { routeConsoleAuth } from "./console-guard";
import type { HostRouteDeps } from "./deps";
import { handleHealth, handleReady } from "./health";
import {
  handleInternalAdminStatsCell,
  handleInternalAdminStatsInactiveMembers,
  handleInternalAdminStatsPrincipal,
  handleInternalAdminStatsSummary,
} from "./internal-admin-stats";
import { handleInternalMintInvite } from "./internal-invite";
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
  handleAdminRegistryPut,
  handleAdminRegistryRegisterPost,
} from "./registry-admin";
import { handleListRelationships } from "./relationships";
import { jsonError, rateLimitedResponse } from "./responses";
import {
  handleRoomsCreate,
  handleRoomsGet,
  handleRoomsJoin,
  handleRoomsMintTicket,
  handleRoomsRemove,
  handleRoomWsUpgrade,
  isRoomWsPath,
  parseRoomsMintTicketRoomId,
  parseRoomsUnaryRoomId,
} from "./rooms";
import { handleSearchGet, handleSearchPost } from "./search";
import { handleUnregister } from "./unregister";
import { handleWellKnownKhora } from "./well-known-khora";

/**
 * Match `req` + `url` against khora HTTP routes. Pass **`upgradePort`** for WebSocket upgrade; omit for unary-only ingress.
 */
export async function route(
  req: Request,
  url: URL,
  upgradePort: KhoraWsUpgradePort | undefined,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  if (req.method === "GET" && url.pathname === "/.well-known/khora") {
    return handleWellKnownKhora(deps.ctx.hostSpec);
  }

  if (req.method === "GET" && url.pathname === "/ready") {
    return handleReady(deps);
  }

  if (req.method === "POST" && url.pathname === "/internal/mint-invite") {
    return handleInternalMintInvite(req, deps);
  }

  if (req.method === "GET" && url.pathname === "/internal/admin/stats/summary") {
    return handleInternalAdminStatsSummary(req, deps);
  }

  if (req.method === "GET" && url.pathname === "/internal/admin/stats/principal") {
    return handleInternalAdminStatsPrincipal(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/internal/admin/stats/cell") {
    return handleInternalAdminStatsCell(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/internal/admin/stats/inactive-members") {
    return handleInternalAdminStatsInactiveMembers(req, url, deps);
  }

  const consoleRoute = await routeConsoleAuth(req, url, deps.consoleAuth);
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

  if (req.method === "PUT" && url.pathname === "/admin/api/registry") {
    return handleAdminRegistryPut(req, deps);
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

  if (req.method === "GET" && url.pathname === "/v1/relationships") {
    return handleListRelationships(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/authors/subscriptions") {
    return handleListAuthorSubscriptions(req, url, deps);
  }

  if (isRoomWsPath(url.pathname)) {
    if (upgradePort === undefined) {
      return jsonError("WebSocket upgrade requires HTTP transport", 501);
    }
    if (req.method !== "GET") {
      return undefined;
    }
    return handleRoomWsUpgrade(req, url, upgradePort, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/rooms") {
    return handleRoomsCreate(req, url, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/rooms/join") {
    return handleRoomsJoin(req, url, deps);
  }

  const unaryRoomSeg = parseRoomsUnaryRoomId(url.pathname);
  if (unaryRoomSeg !== undefined && unaryRoomSeg !== "join") {
    if (req.method === "GET") {
      return handleRoomsGet(req, url, deps, unaryRoomSeg);
    }
    if (req.method === "DELETE") {
      return handleRoomsRemove(req, url, deps, unaryRoomSeg);
    }
  }

  if (req.method === "POST") {
    const roomIdForTicket = parseRoomsMintTicketRoomId(url.pathname);
    if (roomIdForTicket !== undefined) {
      return handleRoomsMintTicket(req, url, deps, roomIdForTicket);
    }
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

/** Unary ingress: inbox and room WS paths return 501. */
export async function routeUnary(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  return route(req, url, undefined, deps);
}

/** Build frame-channel WebSocket handlers for `Bun.serve` from an khora host context. */
export function khoraFrameChannelWsHandlers(
  ctx: KhoraHostContext,
): ReturnType<typeof agentRelayFrameChannelWebSocketHandlers> {
  return agentRelayFrameChannelWebSocketHandlers({ hub: ctx.roomHub });
}
