import { timingSafeEqual } from "node:crypto";
import type { HostRouteDeps } from "./deps.ts";
import { jsonError } from "./responses.ts";

const SYSTEM_MINTER_DID = "did:system";

function readInternalSecret(): string | undefined {
  const s = process.env.ATRIUM_INTERNAL_SECRET?.trim();
  return s !== undefined && s.length > 0 ? s : undefined;
}

function authorizeInternal(req: Request): boolean {
  const expected = readInternalSecret();
  if (expected === undefined) return false;
  const auth = req.headers.get("authorization");
  if (auth === null || !auth.startsWith("Bearer ")) return false;
  const provided = auth.slice("Bearer ".length);
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Mint one standard invite token for internal waitlist flows (homepage server). */
export async function handleInternalMintInvite(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  if (!authorizeInternal(req)) {
    return jsonError("Unauthorized", 401);
  }
  const { invitesRepo } = deps.ctx;
  if (invitesRepo === undefined) {
    return jsonError("Invite minting is not configured", 503);
  }
  const tokens = invitesRepo.mintStandardInviteTokens(SYSTEM_MINTER_DID, 1);
  const token = tokens[0];
  if (token === undefined) {
    return jsonError("Failed to mint invite token", 500);
  }
  return Response.json({ token });
}
