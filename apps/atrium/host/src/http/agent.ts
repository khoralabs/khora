import { zAgentStatusResponse, zAtriumPost, zAtriumProfile } from "@khoralabs/atrium-contracts";
import z from "zod";
import { envAgentSyncProbeLimit } from "../env.ts";
import { parseAuthorTopicSubscriptionSubject } from "../subject-keys.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

const zAgentSyncResponse = z.object({
  profile: zAtriumProfile,
  topicSlugs: z.array(z.string()),
  authorTopics: z.array(
    z.object({
      authorDid: z.string(),
      topicSlug: z.string(),
    }),
  ),
  probes: z.array(zAtriumPost),
});

export async function handleAgentSync(
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
  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
  if (profileId === undefined) {
    return jsonError("Register before sync", 400);
  }
  const profileRow = ctx.host.persistenceClient.getProfileById(profileId);
  if (profileRow === undefined) {
    return jsonError("Profile not found", 404);
  }
  try {
    const profile = zAtriumProfile.parse(JSON.parse(profileRow.bodyJson));
    const topicSlugs = ctx.host.persistenceClient.listTopicSlugsForAgentDid(did);
    const subjects = ctx.host.persistenceClient.listSubjectsForAgentDid(did);
    const authorTopics = subjects
      .map((s) => parseAuthorTopicSubscriptionSubject(s))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map(({ authorDid, topicSlug }) => ({ authorDid, topicSlug }));
    const probeRows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
      authorProfileId: profileId,
      kind: "probe",
      limit: envAgentSyncProbeLimit(),
    });
    const probes = probeRows.flatMap((row) => {
      try {
        return [zAtriumPost.parse(JSON.parse(row.bodyJson))];
      } catch {
        return [];
      }
    });
    const payload = zAgentSyncResponse.parse({ profile, topicSlugs, authorTopics, probes });
    return Response.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
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
  const syncRl = rateLimiters.agentSyncDid(`did:${did}`);
  if (!syncRl.ok) return rateLimitedResponse(syncRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
  if (profileId === undefined) {
    return jsonError("Register before fetching status", 400);
  }
  try {
    const rows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
      authorProfileId: profileId,
      kind: "status",
      limit: 1,
    });
    const first = rows[0];
    if (first === undefined) {
      return Response.json(zAgentStatusResponse.parse({ status: null }));
    }
    const status = zAtriumPost.parse(JSON.parse(first.bodyJson));
    return Response.json(zAgentStatusResponse.parse({ status }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}
