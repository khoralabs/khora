import { zKhoraRelationshipListResponse } from "@khoralabs/khora-contracts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, rateLimitedResponse } from "./responses.ts";

export async function handleListRelationships(
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
  const rl = rateLimiters.relationshipsListDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const rows = ctx.social.listRelationshipsForPrincipal(did);
  const relationships = rows.map((r) => {
    const role = r.creatorPrincipalId === did ? "creator" : "peer";
    return {
      roomId: r.channelId,
      role,
      creatorDid: r.creatorPrincipalId,
      peerDid: r.peerPrincipalId,
      createdAtMs: r.createdAtMs,
      ...(r.expiresAtMs !== undefined ? { expiresAtMs: r.expiresAtMs } : {}),
    };
  });
  const payload = zKhoraRelationshipListResponse.parse({ relationships });
  return Response.json(payload);
}
