import { AGENT_RELAY_AGGREGATE_DOMAIN, AGENT_RELAY_EVENT_KIND } from "@khoralabs/agent-relay";
import {
  AuthStrategyError,
  khoraPostSigningPayloadFromCreate,
  signingPayloadForPatch,
  verifyKhoraPostSignature,
} from "@khoralabs/khora-auth";
import {
  khoraPostCreateSigningContent,
  mergeKhoraPostPatch,
  normalizeTopicSlug,
  zAgentStatusResponse,
  zKhoraPost,
  zKhoraPostCreate,
  zKhoraPostPatch,
} from "@khoralabs/khora-contracts";
import {
  assignPostAddress,
  canReadPost,
  encodePostId,
  listAuthorOutboxRecords,
  resolvePostById,
} from "@khoralabs/khora-host";
import { formatThrownError } from "@khoralabs/khora-transport";
import z from "zod";
import { logger } from "../logger";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses";

function postHandlerError(e: unknown, context: string): Response {
  const status = e instanceof z.ZodError ? 400 : 500;
  const msg = formatThrownError(e);
  if (status >= 500) {
    logger.error({ err: e, context }, "posts handler error");
  }
  return jsonError(msg, status);
}

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
    const post = await resolvePostById(ctx.cluster, id);
    if (post === undefined) {
      return jsonError("Post not found", 404);
    }
    if (
      !canReadPost({
        post,
        readerPrincipalId: did,
        social: ctx.social,
      })
    ) {
      return jsonError("Forbidden", 403);
    }
    return Response.json(post);
  } catch (e) {
    return postHandlerError(e, "getPost");
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
  const pRl = rateLimiters.postsDid(`did:${did}`);
  if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before creating posts", 400);
  }
  try {
    const raw = JSON.parse(bodyText) as unknown;
    const created = zKhoraPostCreate.parse(raw);
    const { authorSignature } = created;
    try {
      await verifyKhoraPostSignature({
        authorDid: did,
        authorSignature,
        payload: khoraPostSigningPayloadFromCreate(did, khoraPostCreateSigningContent(created)),
      });
    } catch (e) {
      if (e instanceof AuthStrategyError) {
        return jsonError(e.message, 401);
      }
      throw e;
    }
    const { recordKey, cellPoolCount } = assignPostAddress({
      cluster: ctx.cluster,
      authorPrincipalId: did,
    });
    const postId = encodePostId({
      authorPrincipalId: did,
      recordKey,
      cellPoolCount,
    });
    const post = zKhoraPost.parse({
      ...khoraPostCreateSigningContent(created),
      authorSignature,
      id: postId,
      authorProfileId: profileId,
    });
    if (post.topics !== undefined) {
      post.topics = post.topics.map((t) => normalizeTopicSlug(t));
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
    return postHandlerError(e, "createPost");
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
  const pRl = rateLimiters.postsDid(`did:${did}`);
  if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
  const agentProfileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (agentProfileId === undefined) {
    return jsonError("Register before updating posts", 400);
  }
  const previous = await resolvePostById(ctx.cluster, id);
  if (previous === undefined) {
    return jsonError("Post not found", 404);
  }
  if (previous.id !== id) {
    return jsonError("Stored post id mismatch", 500);
  }
  const authorId = previous.authorProfileId;
  if (authorId === undefined || authorId.length === 0 || authorId !== agentProfileId) {
    return jsonError("Forbidden", 403);
  }
  try {
    const patchRaw = JSON.parse(bodyText) as unknown;
    if (patchRaw !== null && typeof patchRaw === "object" && "authorProfileId" in patchRaw) {
      return jsonError("authorProfileId cannot be changed", 400);
    }
    const patch = zKhoraPostPatch.parse(patchRaw);
    const { authorSignature, ...patchFields } = patch;
    try {
      await verifyKhoraPostSignature({
        authorDid: did,
        authorSignature,
        payload: signingPayloadForPatch(did, previous, patchFields),
      });
    } catch (e) {
      if (e instanceof AuthStrategyError) {
        return jsonError(e.message, 401);
      }
      throw e;
    }
    const merged = mergeKhoraPostPatch(previous, patch);
    if (merged.topics !== undefined) {
      merged.topics = merged.topics.map((t) => normalizeTopicSlug(t));
    }
    const { recordKey, cellPoolCount } = assignPostAddress({
      cluster: ctx.cluster,
      authorPrincipalId: did,
    });
    const postId = encodePostId({
      authorPrincipalId: did,
      recordKey,
      cellPoolCount,
    });
    const post = zKhoraPost.parse({ ...merged, authorSignature, id: postId });
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
    return postHandlerError(e, "updatePost");
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
  const pRl = rateLimiters.postsDid(`did:${did}`);
  if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
  const agentProfileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (agentProfileId === undefined) {
    return jsonError("Register before deleting posts", 400);
  }
  const post = await resolvePostById(ctx.cluster, id);
  if (post === undefined) {
    return jsonError("Post not found", 404);
  }
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
}

export async function handleAgentStatus(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const pRl = rateLimiters.postsDid(`did:${did}`);
  if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register first", 400);
  }
  const authorCellId = ctx.cluster.assignPrincipalToCell(did);
  const rows = await listAuthorOutboxRecords({
    cluster: ctx.cluster,
    authorPrincipalId: did,
    authorCellId,
    tenantKey: ctx.tenantKey,
    postKind: "status",
    limit: 1,
  });
  let status = null;
  if (rows.length > 0 && rows[0] !== undefined) {
    const { record_key } = rows[0];
    const postId = encodePostId({
      authorPrincipalId: did,
      recordKey: record_key,
      cellPoolCount: ctx.cellPoolCount,
    });
    status = (await resolvePostById(ctx.cluster, postId)) ?? null;
  }
  return Response.json(zAgentStatusResponse.parse({ status }));
}
