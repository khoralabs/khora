import type { HostRouteDeps } from "./deps";
import { authorizeInternal } from "./internal-auth";
import { jsonError } from "./responses";

const SYSTEM_MINTER_DID = "did:system";

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
