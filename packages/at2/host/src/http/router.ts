import type { Server } from "bun";
import { agentRelayFrameChannelWebSocketHandlers } from "@khoralabs/agent-relay";
import type { At2HostContext, At2WsData, HostRouteDeps } from "./deps.ts";
import { handleHealth } from "./health.ts";
import {
  handleAgentStatus,
  handleCreatePost,
  handleDeletePost,
  handleGetPost,
  handleUpdatePost,
} from "./posts.ts";
import {
  handleProfileByDid,
  handleProfileByUsername,
  handleProfilePatch,
} from "./profile.ts";
import {
  handleAuthorSubMutation,
  handleAuthorTopicSubMutation,
  handleListAuthorSubscriptions,
} from "./authors.ts";
import { handleInvitePreview, handleListInvites } from "./invites.ts";
import { handleRegister } from "./register.ts";
import { handleRoomWsUpgrade, handleRoomsCreate, isRoomWsPath } from "./rooms.ts";
import { jsonError } from "./responses.ts";
import { handleTopicSubscribe, handleTopicUnsubscribe } from "./topics.ts";
import { handleInboxWsUpgrade } from "../ws/inbox.ts";

const topicSubscribeRe = /^\/v1\/topics\/([^/]+)\/subscribe$/;

/**
 * Match `req` + `url` against at2 HTTP routes. Pass **`srv`** for WebSocket upgrade; omit for unary-only ingress.
 */
export async function route(
  req: Request,
  url: URL,
  srv: Server<At2WsData> | undefined,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  if (req.method === "POST" && url.pathname === "/v1/register") {
    return handleRegister(req, deps);
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

  if (isRoomWsPath(url.pathname)) {
    if (srv === undefined) {
      return jsonError("WebSocket upgrade requires HTTP transport", 501);
    }
    if (req.method !== "GET") {
      return undefined;
    }
    return handleRoomWsUpgrade(req, url, srv, deps);
  }

  if (req.method === "POST" && url.pathname === "/v1/rooms") {
    return handleRoomsCreate(req, url, deps);
  }

  if (req.method === "GET" && url.pathname === "/v1/inbox/ws") {
    if (srv === undefined) {
      return jsonError("WebSocket upgrade requires HTTP transport", 501);
    }
    return handleInboxWsUpgrade(req, url, srv, deps);
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

  const topicMatch = topicSubscribeRe.exec(url.pathname);
  if (topicMatch !== null && topicMatch[1] !== undefined) {
    if (req.method === "POST") {
      return handleTopicSubscribe(req, url, deps, topicMatch[1]);
    }
    if (req.method === "DELETE") {
      return handleTopicUnsubscribe(req, url, deps, topicMatch[1]);
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

/** Build frame-channel WebSocket handlers for `Bun.serve` from an at2 host context. */
export function at2FrameChannelWsHandlers(ctx: At2HostContext): ReturnType<
  typeof agentRelayFrameChannelWebSocketHandlers
> {
  return agentRelayFrameChannelWebSocketHandlers({ hub: ctx.roomHub });
}
