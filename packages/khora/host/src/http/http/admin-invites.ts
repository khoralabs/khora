import { KHORA_HOST_ADMIN_MINTER_DID } from "../../invites";
import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

const MAX_MINT_COUNT = 10;

function parseMintCount(body: unknown): number {
  if (typeof body !== "object" || body === null || !("count" in body)) {
    return 1;
  }
  const raw = (body as { count: unknown }).count;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 1;
  }
  return Math.min(MAX_MINT_COUNT, Math.max(1, Math.floor(raw)));
}

export async function handleAdminInvitesMint(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    const { invitesRepo } = deps.ctx;
    if (invitesRepo === undefined) {
      return jsonError("Invite minting is not configured", 503);
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* default count */
    }

    const tokens = invitesRepo.mintStandardInviteTokens(
      KHORA_HOST_ADMIN_MINTER_DID,
      parseMintCount(body),
    );
    return Response.json({ ok: true, tokens });
  });
}

export async function handleAdminInvitesList(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, () => {
    const { invitesRepo } = deps.ctx;
    if (invitesRepo === undefined) {
      return Response.json({ invites: [], configured: false });
    }

    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw === null ? 100 : Number.parseInt(limitRaw, 10);
    const limit = Number.isFinite(limitParsed) ? Math.min(500, Math.max(1, limitParsed)) : 100;
    const mintedByDid = url.searchParams.get("mintedByDid")?.trim() || KHORA_HOST_ADMIN_MINTER_DID;

    const invites = invitesRepo.listAllInviteTokens({ limit, mintedByDid });
    return Response.json({ invites, configured: true });
  });
}
