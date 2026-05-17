import { zAtriumInviteListResponse, zAtriumInvitePreviewResponse } from "@khoralabs/at2-contracts";
import z from "zod";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, inviteOpaqueNotFound } from "./responses.ts";

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
  const out = zAtriumInvitePreviewResponse.parse({
    inviter: pr.inviter,
    source: pr.source,
  });
  return Response.json(out);
}

export async function handleListInvites(req: Request, url: URL, deps: HostRouteDeps): Promise<Response> {
  const { ctx } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const invites =
    ctx.invitesRepo === undefined ? [] : ctx.invitesRepo.listInvitesMintedForDid(did);
  const payload = zAtriumInviteListResponse.parse({ invites });
  return Response.json(payload);
}
