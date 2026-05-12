import { zAtriumInviteListResponse, zAtriumInvitePreviewResponse } from "@khoralabs/atrium-contracts";
import z from "zod";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { HostRouteDeps } from "./deps.ts";
import {
  authErrorResponse,
  inviteOpaqueNotFound,
  rateLimitedResponse,
} from "./responses.ts";

const zInvitePreviewBody = z.object({
  token: z.string().trim().min(1),
});

export async function handleInvitePreview(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { invitesRepo, rateLimiters, loadPublicProfileForDid } = deps;
  const ip = clientIpFromRequest(req);
  const prevRl = rateLimiters.invitePreviewIp(`ip:${ip}`);
  if (!prevRl.ok) return rateLimitedResponse(prevRl.retryAfterSec);
  if (invitesRepo === undefined) {
    return inviteOpaqueNotFound();
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return inviteOpaqueNotFound();
  }
  const parsed = zInvitePreviewBody.safeParse(raw);
  if (!parsed.success) {
    return inviteOpaqueNotFound();
  }
  const pr = invitesRepo.previewInviteToken(parsed.data.token, loadPublicProfileForDid);
  if (!pr.ok) {
    return inviteOpaqueNotFound();
  }
  const out = zAtriumInvitePreviewResponse.parse({
    inviter: pr.inviter,
    source: pr.source,
  });
  return Response.json(out);
}

export async function handleListInvites(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, invitesRepo, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const listRl = rateLimiters.invitesListDid(`did:${did}`);
  if (!listRl.ok) return rateLimitedResponse(listRl.retryAfterSec);
  const invites = invitesRepo === undefined ? [] : invitesRepo.listInvitesMintedForDid(did);
  const payload = zAtriumInviteListResponse.parse({ invites });
  return Response.json(payload);
}
