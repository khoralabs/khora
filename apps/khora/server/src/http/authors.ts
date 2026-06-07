import { listAuthorSubscriptionsSnapshot } from "@khoralabs/khora-contracts";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, rateLimitedResponse } from "./responses";

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

  const queries = ctx.percolator.percolator
    .listQueriesByOwner(did)
    .filter((query) => query.active)
    .map((query) => ({ id: query.id, search: query.search }));

  const snap = listAuthorSubscriptionsSnapshot(queries, (profileId) =>
    ctx.host.persistenceClient.principalForProfileId(profileId),
  );

  return Response.json(snap);
}
