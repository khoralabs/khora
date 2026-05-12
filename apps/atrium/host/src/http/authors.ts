import { authorDidFromSubscriptionSubject, authorSubscriptionSubject } from "../subject-keys.ts";
import type { HostRouteDeps } from "./deps.ts";

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
  const subjects = ctx.host.persistenceClient.listSubjectsForAgentDid(did);
  const authorDids = subjects
    .map((s) => authorDidFromSubscriptionSubject(s))
    .filter((d): d is string => d !== undefined);
  return Response.json({ authorDids });
}

/** POST/DELETE `/v1/authors/:username/subscribe`. Returns undefined for unsupported methods. */
export async function handleAuthorSubMutation(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  usernameRaw: string,
): Promise<Response | undefined> {
  const { ctx, rateLimiters } = deps;
  const username = usernameRaw.trim();
  if (username.length === 0) {
    return jsonError("username required", 400);
  }
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);

  const row = ctx.usernamesRepo.lookupByUsername(username);
  if (row === undefined) {
    return jsonError("unknown username", 404);
  }
  if (row.did === did) {
    return jsonError("cannot subscribe to yourself", 400);
  }
  const subject = authorSubscriptionSubject(row.did);

  if (req.method === "POST") {
    ctx.host.persistenceClient.subscribeAgentSubject(did, subject);
    return Response.json({ ok: true, username, authorDid: row.did });
  }
  if (req.method === "DELETE") {
    ctx.host.persistenceClient.unsubscribeAgentSubject(did, subject);
    return new Response(null, { status: 204 });
  }
  return undefined;
}
