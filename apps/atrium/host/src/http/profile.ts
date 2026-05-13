import {
  type AtriumProfile,
  mergeAtriumProfilePatch,
  normalizeUsername,
  zAtriumProfile,
  zAtriumProfilePatch,
} from "@khoralabs/atrium-contracts";
import { SWARM_AGGREGATE_DOMAIN, SWARM_EVENT_KIND } from "@khoralabs/swarm-host";
import z from "zod";
import type { AtriumHostContext } from "../create-atrium-host.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export function loadPublicProfileForDid(ctx: AtriumHostContext, did: string): AtriumProfile | null {
  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
  if (profileId === undefined) return null;
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) return null;
  const parsed = zAtriumProfile.safeParse(JSON.parse(row.bodyJson));
  return parsed.success ? parsed.data : null;
}

/** `GET /v1/profile/by-did/:encodedDid` — authenticated; same body shape as by-username. */
export async function handleProfileByDid(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  authorDid: string,
): Promise<Response> {
  const { ctx, rateLimiters, loadPublicProfileForDid: loadProfile } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const tRl = rateLimiters.topicsDid(`did:${did}`);
  if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
  if (ctx.host.persistenceClient.profileIdForAgentDid(did) === undefined) {
    return jsonError("Register before fetching profiles", 400);
  }
  const profile = loadProfile(authorDid);
  if (profile === null) return jsonError("Profile not found", 404);
  return Response.json({ did: authorDid, profile });
}

export function handleProfileByUsername(deps: HostRouteDeps, rawUsername: string): Response {
  const { ctx, loadPublicProfileForDid: loadProfile } = deps;
  let normalized: string;
  try {
    normalized = normalizeUsername(rawUsername);
  } catch {
    return jsonError("Username not found", 404);
  }
  const lookup = ctx.usernamesRepo.lookupByUsername(normalized);
  if (lookup === undefined) return jsonError("Username not found", 404);
  const profile = loadProfile(lookup.did);
  if (profile === null) return jsonError("Profile not found", 404);
  return Response.json({ did: lookup.did, profile });
}

export async function handleUpdateProfile(
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
  let renamed: { from: string; to: string } | undefined;
  try {
    const pRl = rateLimiters.profileDid(`did:${did}`);
    if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
    const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
    if (profileId === undefined) {
      return jsonError("Register before updating profile", 400);
    }
    const row = ctx.host.persistenceClient.getProfileById(profileId);
    if (row === undefined) {
      return jsonError("Profile not found", 404);
    }
    const previous = zAtriumProfile.parse(JSON.parse(row.bodyJson));
    const patchRaw = JSON.parse(bodyText) as unknown;
    const patch = zAtriumProfilePatch.parse(patchRaw);
    if (Object.keys(patch).length === 0) {
      return jsonError("Provide at least one of username, displayName, bio", 400);
    }
    if (patch.username !== undefined && patch.username !== previous.username) {
      const r = ctx.usernamesRepo.rename(did, patch.username);
      if (!r.ok) {
        if (r.reason === "taken") {
          return Response.json(
            { error: "Username is already taken", code: "username_taken" },
            { status: 409 },
          );
        }
        return jsonError("Username reservation missing for this DID", 500);
      }
      renamed = { from: previous.username, to: patch.username };
    }
    const profile = mergeAtriumProfilePatch(previous, patch);
    await ctx.host.notify({
      kind: SWARM_EVENT_KIND.PROFILE_UPDATED,
      occurredAt: Date.now(),
      aggregate: { domain: SWARM_AGGREGATE_DOMAIN.profile, id: profile.id },
      change: "updated",
      source: "app",
      payload: { profile, previous },
    });
    return Response.json(profile);
  } catch (e) {
    if (renamed !== undefined) {
      ctx.usernamesRepo.rename(did, renamed.from);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
  }
}
