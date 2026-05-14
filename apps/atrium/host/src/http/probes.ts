import { zAtriumPost } from "@khoralabs/atrium-contracts";
import { envAgentSyncProbeLimit } from "../env.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export async function handleListProbes(
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
  const syncRl = rateLimiters.agentSyncDid(`did:${did}`);
  if (!syncRl.ok) return rateLimitedResponse(syncRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before listing probes", 400);
  }
  const rows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
    authorProfileId: profileId,
    kind: "probe",
    limit: envAgentSyncProbeLimit(),
  });
  const probes = rows.flatMap((row) => {
    try {
      return [zAtriumPost.parse(JSON.parse(row.bodyJson))];
    } catch {
      return [];
    }
  });
  const activeOnly = url.searchParams.get("active") === "1";
  if (activeOnly) {
    const now = Date.now();
    const filtered = probes.filter((p) => p.expiresAtMs === undefined || p.expiresAtMs > now);
    return Response.json({ probes: filtered });
  }
  return Response.json({ probes });
}
