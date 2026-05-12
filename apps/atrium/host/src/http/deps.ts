import type { AtriumProfile } from "@khoralabs/atrium-contracts";
import type { AtriumHostContext } from "../create-atrium-host.ts";
import type { AtriumInvitesRepo } from "../invites/index.ts";
import type { HostRateLimiters } from "../rate-limit-buckets.ts";

export type HostRouteDeps = {
  ctx: AtriumHostContext;
  invitesRepo: AtriumInvitesRepo | undefined;
  rateLimiters: HostRateLimiters;
  loadPublicProfileForDid: (did: string) => AtriumProfile | null;
};
