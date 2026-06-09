import { runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import type { VellumCliContext } from "./context";
import { channelAttachFlowDefinition } from "./definitions";
import { createVellumFlowChainView } from "./vellum-flow-chain";

/** Invite token from flags, or optional readline prompt when attach has no channel id yet. */
export async function resolveAttachInviteToken(
  ctx: VellumCliContext,
  flags: FlagMap,
  opts?: { promptIfMissing?: boolean },
): Promise<string | undefined> {
  const fromFlag = strFlag(flags, "invite-token") ?? strFlag(flags, "inviteToken");
  if (fromFlag !== undefined && fromFlag.trim().length > 0) return fromFlag.trim();

  if (opts?.promptIfMissing !== true) return undefined;

  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createVellumFlowChainView(),
    def: channelAttachFlowDefinition,
    offerId: "attach",
    partialSeeds: {},
  });
  const token = row.inviteToken?.trim();
  return token !== undefined && token.length > 0 ? token : undefined;
}
