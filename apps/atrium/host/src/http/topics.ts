import { normalizeTopicSlug } from "@khoralabs/atrium-contracts";
import { topicSubscriptionSubject } from "../subject-keys.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export async function handleListTopics(
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
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  const topicSlugs = ctx.host.persistenceClient.listTopicSlugsForPrincipal(did);
  return Response.json({ topicSlugs });
}

/** Handles POST/DELETE `/v1/topics/:slug/subscribe`. Returns undefined for unsupported methods. */
export async function handleTopicSubMutation(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  slugRaw: string,
): Promise<Response | undefined> {
  const { ctx, rateLimiters } = deps;
  let slug: string;
  try {
    slug = normalizeTopicSlug(slugRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 400);
  }
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  if (req.method === "POST") {
    ctx.host.persistenceClient.subscribeAgentSubject(did, topicSubscriptionSubject(slug));
    return Response.json({ ok: true, topicSlug: slug });
  }
  if (req.method === "DELETE") {
    ctx.host.persistenceClient.unsubscribeAgentSubject(did, topicSubscriptionSubject(slug));
    return new Response(null, { status: 204 });
  }
  return undefined;
}
