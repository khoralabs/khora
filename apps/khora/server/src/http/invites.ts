import { zKhoraInviteListResponse, zKhoraInvitePreviewResponse } from "@khoralabs/khora-contracts";
import z from "zod";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, inviteOpaqueNotFound, rateLimitedResponse } from "./responses.ts";

const zInvitePreviewBody = z.object({
  token: z.string().trim().min(1),
});

function loadPublicProfileForDid(deps: HostRouteDeps, did: string): unknown | null {
  const pid = deps.ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (pid === undefined) return null;
  const row = deps.ctx.host.persistenceClient.getProfileById(pid);
  if (row === undefined) return null;
  try {
    return JSON.parse(row.bodyJson);
  } catch {
    return null;
  }
}

export async function handleInvitePreview(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { invitesRepo } = deps.ctx;
  const ip = clientIpFromRequest(req);
  const prevRl = deps.rateLimiters.invitePreviewIp(`ip:${ip}`);
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
  const pr = invitesRepo.previewInviteToken(parsed.data.token, (did) =>
    loadPublicProfileForDid(deps, did),
  );
  if (!pr.ok) {
    return inviteOpaqueNotFound();
  }
  const out = zKhoraInvitePreviewResponse.parse({
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
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const listRl = rateLimiters.invitesListDid(`did:${did}`);
  if (!listRl.ok) return rateLimitedResponse(listRl.retryAfterSec);
  const invites = ctx.invitesRepo === undefined ? [] : ctx.invitesRepo.listInvitesMintedForDid(did);
  const payload = zKhoraInviteListResponse.parse({ invites });
  return Response.json(payload);
}
