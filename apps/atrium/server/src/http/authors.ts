import { normalizeTopicSlug, normalizeUsername } from "@khoralabs/at2-contracts";
import {
  authorDidFromSubscriptionSubject,
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  parseAuthorTopicSubscriptionSubject,
} from "@khoralabs/at2-host";
import {
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "@khoralabs/relay-colonnade";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

function resolveAuthorDidFromUsernameInput(
  ctx: HostRouteDeps["ctx"],
  usernameRaw: string,
): { ok: true; authorDid: string } | { ok: false; response: Response } {
  const username = usernameRaw.trim();
  if (username.length === 0) {
    return { ok: false, response: jsonError("username required", 400) };
  }
  let normalized: string;
  try {
    normalized = normalizeUsername(username);
  } catch {
    return { ok: false, response: jsonError("unknown username", 404) };
  }
  const hit = ctx.store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    SOURCE_USERNAME_TO_PRINCIPAL,
    normalized,
  );
  if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
    return { ok: false, response: jsonError("unknown username", 404) };
  }
  const pid = (hit.projection as Record<string, unknown>).principalId;
  if (typeof pid !== "string") {
    return { ok: false, response: jsonError("unknown username", 404) };
  }
  return { ok: true, authorDid: pid };
}

export async function handleListAuthorSubscriptions(
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
  const subjects = ctx.host.persistenceClient.listSubjectsForPrincipal(did);
  const authorDids = subjects
    .map((s) => authorDidFromSubscriptionSubject(s))
    .filter((d): d is string => d !== undefined);
  const authorTopics = subjects
    .map((s) => parseAuthorTopicSubscriptionSubject(s))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map(({ authorDid, topicSlug }) => ({ authorDid, topicSlug }));
  return Response.json({ authorDids, authorTopics });
}

export async function handleAuthorSubMutation(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  usernameRaw: string,
): Promise<Response | undefined> {
  const { ctx } = deps;
  const resolved = resolveAuthorDidFromUsernameInput(ctx, usernameRaw);
  if (!resolved.ok) {
    return resolved.response;
  }
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = deps.rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  if (resolved.authorDid === did) {
    return jsonError("cannot subscribe to yourself", 400);
  }
  const subject = authorSubscriptionSubject(resolved.authorDid);
  if (req.method === "POST") {
    ctx.host.persistenceClient.subscribeAgentSubject(did, subject);
    return Response.json({ ok: true, username: usernameRaw.trim(), authorDid: resolved.authorDid });
  }
  if (req.method === "DELETE") {
    ctx.host.persistenceClient.unsubscribeAgentSubject(did, subject);
    return new Response(null, { status: 204 });
  }
  return undefined;
}

export async function handleAuthorTopicSubMutation(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  usernameRaw: string,
  slugRaw: string,
): Promise<Response | undefined> {
  const { ctx } = deps;
  const resolved = resolveAuthorDidFromUsernameInput(ctx, usernameRaw);
  if (!resolved.ok) {
    return resolved.response;
  }
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
  const tRl = deps.rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  if (resolved.authorDid === did) {
    return jsonError("cannot subscribe to yourself", 400);
  }
  const subject = authorTopicSubscriptionSubject(resolved.authorDid, slug);
  if (req.method === "POST") {
    ctx.host.persistenceClient.subscribeAgentSubject(did, subject);
    return Response.json({
      ok: true,
      username: usernameRaw.trim(),
      authorDid: resolved.authorDid,
      topicSlug: slug,
    });
  }
  if (req.method === "DELETE") {
    ctx.host.persistenceClient.unsubscribeAgentSubject(did, subject);
    return new Response(null, { status: 204 });
  }
  return undefined;
}
