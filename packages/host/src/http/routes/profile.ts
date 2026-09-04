import {
  mergeKhoraProfilePatch,
  normalizeUsername,
  zKhoraProfile,
  zKhoraProfilePatch,
} from "@khoralabs/khora-contracts";
import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import z from "zod";
import { HOST_AGGREGATE_DOMAIN, HOST_EVENT_KIND } from "../..";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses";

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
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const profile = zKhoraProfile.parse(JSON.parse(row.bodyJson));
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
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const principalId = ctx.lookupPrincipalIdByNormalizedUsername(normalized);
  if (principalId === undefined) {
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(principalId);
  if (profileId === undefined) {
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const profile = zKhoraProfile.parse(JSON.parse(row.bodyJson));
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
    return jsonError("Register first", 400, KHORA_ERROR_CODE.not_registered);
  }
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) {
    return jsonError("Profile not found", 404, KHORA_ERROR_CODE.not_found);
  }
  const previous = zKhoraProfile.parse(JSON.parse(row.bodyJson));
  try {
    const patch = zKhoraProfilePatch.parse(JSON.parse(bodyText) as unknown);
    const merged = mergeKhoraProfilePatch(previous, patch);
    if (merged.username !== previous.username) {
      try {
        ctx.applyProfileUsernameAndMaps({
          principalId: did,
          profileUpsert: { id: merged.id, bodyJson: JSON.stringify(merged) },
          username: merged.username,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("unavailable")) {
          return jsonError(msg, 409, KHORA_ERROR_CODE.username_taken);
        }
        throw e;
      }
    }
    await ctx.host.notify({
      kind: HOST_EVENT_KIND.PROFILE_UPDATED,
      occurredAt: Date.now(),
      aggregate: {
        domain: HOST_AGGREGATE_DOMAIN.profile,
        id: merged.id,
      },
      change: "updated",
      source: "app",
      payload: { profile: merged, previous },
    });
    return Response.json(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(
      msg,
      e instanceof z.ZodError ? 400 : 500,
      e instanceof z.ZodError ? KHORA_ERROR_CODE.invalid_request : KHORA_ERROR_CODE.internal_error,
    );
  }
}
