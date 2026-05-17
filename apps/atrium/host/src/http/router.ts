import type { Server } from "bun";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { AtriumWsData } from "../ws/inbox.ts";
import { handleAgentStatus, handleAgentSync } from "./agent.ts";
import {
  handleAtriumRoomMintTicket,
  handleAtriumRoomsCreate,
  handleAtriumRoomsList,
  handleAtriumRoomWsUpgrade,
  isAtriumRoomWsPath,
  parseAtriumRoomTicketPath,
} from "./atrium-rooms.ts";
import {
  handleAuthorSubMutation,
  handleAuthorTopicSubMutation,
  handleListAuthorSubscriptions,
} from "./authors.ts";
import type { HostRouteDeps } from "./deps.ts";
import { handleHealth } from "./health.ts";
import { handleInboxList, handleInboxWsUpgrade } from "./inbox.ts";
import { handleInvitePreview, handleListInvites } from "./invites.ts";
import { handleMemoriesSearch } from "./memories-search.ts";
import { handleCreatePost, handleDeletePost, handleGetPost, handleUpdatePost } from "./posts.ts";
import { handleListProbes } from "./probes.ts";
import { handleProfileByDid, handleProfileByUsername, handleUpdateProfile } from "./profile.ts";
import { handleRegister } from "./register.ts";
import { handleUnregister } from "./unregister.ts";
import { jsonError, rateLimitedResponse } from "./responses.ts";
import { handleListTopics, handleTopicSubMutation } from "./topics.ts";

export type { HostRouteDeps } from "./deps.ts";

/**
 * Match `req` + `url` against the host's HTTP routes and invoke the right handler.
 * Pass **`srv`** only for Bun HTTP (WebSocket upgrade); omit/`undefined` for unary IPC ingress —
 * WebSocket routes respond **501** instead of upgrading.
 *
 * Returns `undefined` when no route matched (or after a successful WebSocket upgrade),
 * letting the caller emit a 404.
 */
export async function route(
  req: Request,
  url: URL,
  srv: Server<AtriumWsData> | undefined,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  const ipRl = deps.rateLimiters.defaultIp(`ip:${clientIpFromRequest(req)}`);
  if (!ipRl.ok) {
    return rateLimitedResponse(ipRl.retryAfterSec);
  }

  if (req.method === "POST" && url.pathname === "/v1/register") {
    return handleRegister(req, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/unregister") {
    return handleUnregister(req, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/invite/preview") {
    return handleInvitePreview(req, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/invites") {
    return handleListInvites(req, url, deps);
  }

  if (req.method === "GET" && isAtriumRoomWsPath(url.pathname)) {
    if (srv === undefined) {
      return jsonError("WebSocket upgrade requires HTTP transport", 501);
    }
    return handleAtriumRoomWsUpgrade(req, url, srv, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/atrium/rooms") {
    return handleAtriumRoomsList(req, url, deps);
  }

  const roomTicketPath = parseAtriumRoomTicketPath(url.pathname);
  if (req.method === "POST" && roomTicketPath !== undefined) {
    return handleAtriumRoomMintTicket(req, url, deps, roomTicketPath);
  }

  if (req.method === "POST" && url.pathname === "/v1/atrium/rooms") {
    return handleAtriumRoomsCreate(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/inbox/ws") {
    if (srv === undefined) {
      return jsonError("WebSocket upgrade requires HTTP transport", 501);
    }
    return handleInboxWsUpgrade(req, url, srv, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/inbox") {
    return handleInboxList(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/agent/sync") {
    return handleAgentSync(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/agent/status") {
    return handleAgentStatus(req, url, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/memories/search") {
    return handleMemoriesSearch(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/topics") {
    return handleListTopics(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/authors/subscriptions") {
    return handleListAuthorSubscriptions(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/probes") {
    return handleListProbes(req, url, deps);
  }

  const topicSubMatch = /^\/v1\/topics\/([^/]+)\/subscribe$/.exec(url.pathname);
  if (topicSubMatch !== null && topicSubMatch[1] !== undefined) {
    const slugRaw = decodeURIComponent(topicSubMatch[1]);
    const r = await handleTopicSubMutation(req, url, deps, slugRaw);
    if (r !== undefined) return r;
  }

  const authorTopicSubMatch = /^\/v1\/authors\/([^/]+)\/topics\/([^/]+)\/subscribe$/.exec(
    url.pathname,
  );
  if (
    authorTopicSubMatch !== null &&
    authorTopicSubMatch[1] !== undefined &&
    authorTopicSubMatch[2] !== undefined
  ) {
    const usernameRaw = decodeURIComponent(authorTopicSubMatch[1]);
    const slugRaw = decodeURIComponent(authorTopicSubMatch[2]);
    const r = await handleAuthorTopicSubMutation(req, url, deps, usernameRaw, slugRaw);
    if (r !== undefined) return r;
  }

  const authorSubMatch = /^\/v1\/authors\/([^/]+)\/subscribe$/.exec(url.pathname);
  if (authorSubMatch !== null && authorSubMatch[1] !== undefined) {
    const usernameRaw = decodeURIComponent(authorSubMatch[1]);
    const r = await handleAuthorSubMutation(req, url, deps, usernameRaw);
    if (r !== undefined) return r;
  }

  const byUsernameMatch = /^\/v1\/profile\/by-username\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && byUsernameMatch !== null) {
    return handleProfileByUsername(deps, decodeURIComponent(byUsernameMatch[1] ?? ""));
  }

  const byDidMatch = /^\/v1\/profile\/by-did\/(.+)$/.exec(url.pathname);
  if (req.method === "GET" && byDidMatch !== null && byDidMatch[1] !== undefined) {
    return handleProfileByDid(req, url, deps, decodeURIComponent(byDidMatch[1]));
  }

  const postPathMatch = /^\/v1\/posts\/([^/]+)$/.exec(url.pathname);

  if (req.method === "PATCH" && url.pathname === "/v1/profile") {
    return handleUpdateProfile(req, url, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/posts") {
    return handleCreatePost(req, url, deps);
  }

  if (postPathMatch !== null && postPathMatch[1] !== undefined) {
    const id = decodeURIComponent(postPathMatch[1]);
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

/** Unary ingress only (`srv` omitted): inbox and room NBC routes cannot upgrade and return 501. */
export async function routeUnary(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  return route(req, url, undefined, deps);
}
