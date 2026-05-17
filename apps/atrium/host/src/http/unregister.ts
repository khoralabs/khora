import type { PrincipalRegistrationRequest } from "@khoralabs/agent-relay";
import { AGENT_RELAY_AGGREGATE_DOMAIN, AGENT_RELAY_EVENT_KIND } from "@khoralabs/agent-relay";
import { zAtriumPost, zAtriumProfile, zAtriumUnregisterRequestBody } from "@khoralabs/atrium-contracts";
import { clientIpFromRequest } from "../rate-limit.ts";
import { listAllPostRowsByAuthorProfileId } from "../persistence/sqlite/probe-posts-sqlite.ts";
import type { HostRouteDeps } from "./deps.ts";
import {
  authErrorResponse,
  rateLimitedResponse,
  registrationOpaqueJson,
} from "./responses.ts";

export async function handleUnregister(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const ip = clientIpFromRequest(req);
  const bodyText = await req.text();
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return registrationOpaqueJson(400);
  }
  const parsed = zAtriumUnregisterRequestBody.safeParse(raw);
  if (!parsed.success) {
    return registrationOpaqueJson(400);
  }
  const body = parsed.data;
  const swarmReq: PrincipalRegistrationRequest = {
    principalId: body.did,
    ...(body.correlationId !== undefined ? { correlationId: body.correlationId } : {}),
  };
  try {
    await ctx.auth.verifyUnregister(req, bodyText, swarmReq);
  } catch (e) {
    return authErrorResponse(e);
  }
  const regIp = rateLimiters.registerIp(`ip:${ip}`);
  if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
  const regDid = rateLimiters.registerDid(`did:${swarmReq.principalId}`);
  if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);

  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(swarmReq.principalId);
  if (profileId === undefined) {
    return new Response(null, { status: 204 });
  }
  const profileRow = ctx.host.persistenceClient.getProfileById(profileId);
  if (profileRow === undefined) {
    return new Response(null, { status: 204 });
  }
  const profile = zAtriumProfile.parse(JSON.parse(profileRow.bodyJson));

  for (;;) {
    const rows = listAllPostRowsByAuthorProfileId(ctx.db, profileId, 400);
    if (rows.length === 0) break;
    for (const r of rows) {
      const post = zAtriumPost.parse(JSON.parse(r.bodyJson));
      await ctx.host.notify({
        kind: AGENT_RELAY_EVENT_KIND.POST_DELETED,
        occurredAt: Date.now(),
        aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.post, id: post.id },
        change: "deleted",
        source: "app",
        payload: { post },
      });
    }
  }

  await ctx.host.notify({
    kind: AGENT_RELAY_EVENT_KIND.PROFILE_DELETED,
    occurredAt: Date.now(),
    aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.profile, id: profile.id },
    change: "deleted",
    source: "app",
    payload: { profile, principalId: swarmReq.principalId },
  });
  return new Response(null, { status: 204 });
}
