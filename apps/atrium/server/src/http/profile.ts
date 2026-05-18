import {
  AGENT_RELAY_AGGREGATE_DOMAIN,
  AGENT_RELAY_EVENT_KIND,
} from "@khoralabs/agent-relay";
import {
  mergeAtriumProfilePatch,
  normalizeUsername,
  zAtriumProfile,
  zAtriumProfilePatch,
} from "@khoralabs/at2-contracts";
import {
  registerAgentOnColonnadePersistence,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "@khoralabs/relay-colonnade";
import z from "zod";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export async function handleProfileByDid(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  did: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let authedDid: string;
  try {
    ({ did: authedDid } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${authedDid}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Not found", 404);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Not found", 404);
  }
  const profile = zAtriumProfile.parse(JSON.parse(row.bodyJson));
  return Response.json(profile);
}

export async function handleProfileByUsername(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  usernameRaw: string,
): Promise<Response> {
  const { ctx } = deps;
  try {
    await ctx.auth.requireAuthenticatedRequest(req, url, "", []);
  } catch (e) {
    return authErrorResponse(e);
  }
  let normalized: string;
  try {
    normalized = normalizeUsername(decodeURIComponent(usernameRaw));
  } catch {
    return jsonError("Not found", 404);
  }
  const hit = ctx.store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    SOURCE_USERNAME_TO_PRINCIPAL,
    normalized,
  );
  if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
    return jsonError("Not found", 404);
  }
  const principalId = (hit.projection as Record<string, unknown>).principalId;
  if (typeof principalId !== "string") {
    return jsonError("Not found", 404);
  }
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(principalId);
  if (profileId === undefined) {
    return jsonError("Not found", 404);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Not found", 404);
  }
  const profile = zAtriumProfile.parse(JSON.parse(row.bodyJson));
  return Response.json(profile);
}

export async function handleProfilePatch(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const pRl = rateLimiters.profileDid(`did:${did}`);
  if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register first", 400);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Profile not found", 404);
  }
  const previous = zAtriumProfile.parse(JSON.parse(row.bodyJson));
  try {
    const patch = zAtriumProfilePatch.parse(JSON.parse(bodyText) as unknown);
    const merged = mergeAtriumProfilePatch(previous, patch);
    if (merged.username !== previous.username) {
      try {
        registerAgentOnColonnadePersistence(ctx.host.persistence, ctx.catalogDb, ctx.store, {
          principalId: did,
          profileUpsert: { id: merged.id, bodyJson: JSON.stringify(merged) },
          username: merged.username,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("unavailable")) {
          return jsonError(msg, 409);
        }
        throw e;
      }
    }
    await ctx.host.notify({
      kind: AGENT_RELAY_EVENT_KIND.PROFILE_UPDATED,
      occurredAt: Date.now(),
      aggregate: { domain: AGENT_RELAY_AGGREGATE_DOMAIN.profile, id: merged.id },
      change: "updated",
      source: "app",
      payload: { profile: merged, previous },
    });
    return Response.json(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}
