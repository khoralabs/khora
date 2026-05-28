import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, rateLimitedResponse } from "./responses.ts";

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
  const queries = ctx.percolator.percolator.listQueriesByOwner(did);
  const authorDids: string[] = [];
  const authorTopics: { authorDid: string; topicSlug: string }[] = [];
  for (const query of queries) {
    if (!query.active) continue;
    const ns = query.search.namespace;
    if (ns?.endsWith("/posts") && query.search.searchScopeMode === "pathSubtree") {
      const profileId = ns.split("/").at(-2);
      if (profileId !== undefined) {
        const authorDid = ctx.host.persistenceClient.principalForAgentProfileId(profileId);
        if (authorDid !== undefined) {
          const topicLabels = query.search.options?.labels?.some ?? [];
          if (topicLabels.length === 0) {
            authorDids.push(authorDid);
          } else {
            for (const label of topicLabels) {
              const prefix = "khora_topic:";
              if (label.startsWith(prefix)) {
                authorTopics.push({ authorDid, topicSlug: label.slice(prefix.length) });
              }
            }
          }
        }
      }
    }
  }
  return Response.json({ authorDids, authorTopics });
}
