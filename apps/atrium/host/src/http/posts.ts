import { AGENT_RELAY_AGGREGATE_DOMAIN, AGENT_RELAY_EVENT_KIND } from "@khoralabs/agent-relay";
import {
  mergeAtriumPostPatch,
  normalizeTopicSlug,
  zAtriumPost,
  zAtriumPostCreate,
  zAtriumPostPatch,
} from "@khoralabs/atrium-contracts";
import { stableId } from "@khoralabs/memories-core";
import z from "zod";
import { deleteOtherStatusPostsForAuthor } from "../atrium-status-posts.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

/** `GET /v1/posts/:id` — authenticated; returns canonical `AtriumPost` for any existing post. */
export async function handleGetPost(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  id: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const pRl = rateLimiters.postsDid(`did:${did}`);
    if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
    if (ctx.host.persistenceClient.profileIdForPrincipal(did) === undefined) {
      return jsonError("Register before fetching posts", 400);
    }
    const row = ctx.host.persistenceClient.getPostById(id);
    if (row === undefined) {
      return jsonError("Post not found", 404);
    }
    const post = zAtriumPost.parse(JSON.parse(row.bodyJson));
    return Response.json(post);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}

export async function handleCreatePost(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const pRl = rateLimiters.postsDid(`did:${did}`);
    if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
    const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
    if (profileId === undefined) {
      return jsonError("Register before creating posts", 400);
    }
    const raw = JSON.parse(bodyText) as unknown;
    const created = zAtriumPostCreate.parse(raw);
    const post = zAtriumPost.parse({
      ...created,
      id: stableId("atrium_post", crypto.randomUUID()),
      authorProfileId: profileId,
    });
    if (post.topics !== undefined) {
      post.topics = post.topics.map((t) => normalizeTopicSlug(t));
    }
    if (post.kind === "status") {
      await deleteOtherStatusPostsForAuthor(ctx, profileId, post.id);
    }
    await ctx.host.notify({
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      occurredAt: Date.now(),
      aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.post, id: post.id },
      change: "created",
      source: "app",
      payload: { post },
    });
    return Response.json(post);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}

export async function handleUpdatePost(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  id: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const pRl = rateLimiters.postsDid(`did:${did}`);
    if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
    const agentProfileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
    if (agentProfileId === undefined) {
      return jsonError("Register before updating posts", 400);
    }
    const row = ctx.host.persistenceClient.getPostById(id);
    if (row === undefined) {
      return jsonError("Post not found", 404);
    }
    const previous = zAtriumPost.parse(JSON.parse(row.bodyJson));
    if (previous.id !== id) {
      return jsonError("Stored post id mismatch", 500);
    }
    const authorId = previous.authorProfileId;
    if (authorId === undefined || authorId.length === 0 || authorId !== agentProfileId) {
      return jsonError("Forbidden", 403);
    }
    const patchRaw = JSON.parse(bodyText) as unknown;
    if (patchRaw !== null && typeof patchRaw === "object" && "authorProfileId" in patchRaw) {
      return jsonError("authorProfileId cannot be changed", 400);
    }
    const patch = zAtriumPostPatch.parse(patchRaw);
    const post = mergeAtriumPostPatch(previous, patch);
    if (post.topics !== undefined) {
      post.topics = post.topics.map((t) => normalizeTopicSlug(t));
    }
    if (post.kind === "status") {
      await deleteOtherStatusPostsForAuthor(ctx, agentProfileId, post.id);
    }
    await ctx.host.notify({
      kind: AGENT_RELAY_EVENT_KIND.POST_UPDATED,
      occurredAt: Date.now(),
      aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.post, id: post.id },
      change: "updated",
      source: "app",
      payload: { post, previous },
    });
    return Response.json(post);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}

export async function handleDeletePost(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  id: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const pRl = rateLimiters.postsDid(`did:${did}`);
    if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
    const agentProfileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
    if (agentProfileId === undefined) {
      return jsonError("Register before deleting posts", 400);
    }
    const row = ctx.host.persistenceClient.getPostById(id);
    if (row === undefined) {
      return jsonError("Post not found", 404);
    }
    const post = zAtriumPost.parse(JSON.parse(row.bodyJson));
    const authorId = post.authorProfileId;
    if (authorId === undefined || authorId.length === 0 || authorId !== agentProfileId) {
      return jsonError("Forbidden", 403);
    }
    await ctx.host.notify({
      kind: AGENT_RELAY_EVENT_KIND.POST_DELETED,
      occurredAt: Date.now(),
      aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.post, id: post.id },
      change: "deleted",
      source: "app",
      payload: { post },
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}
