import { normalizeTopicSlug } from "@khoralabs/atrium-contracts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export async function handleTopicSubscribe(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  slugRaw: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  if (ctx.host.persistenceClient.profileIdForPrincipal(did) === undefined) {
    return jsonError("Register first", 400);
  }
  let slug: string;
  try {
    slug = normalizeTopicSlug(decodeURIComponent(slugRaw));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid topic";
    return jsonError(msg, 400);
  }
  ctx.host.persistenceClient.subscribeAgentSubject(did, `topic:${slug}`);
  return new Response(null, { status: 204 });
}

export async function handleTopicUnsubscribe(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  slugRaw: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  if (req.method !== "DELETE") {
    return jsonError("Method not allowed", 405);
  }
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  let slug: string;
  try {
    slug = normalizeTopicSlug(decodeURIComponent(slugRaw));
  } catch {
    return jsonError("Invalid topic", 400);
  }
  ctx.host.persistenceClient.unsubscribeAgentSubject(did, `topic:${slug}`);
  return new Response(null, { status: 204 });
}
