import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";

import type { VellumCliContext } from "./context.ts";
import { registerFlowDefinition } from "./definitions.ts";
import { createVellumFlowChainView } from "./vellum-flow-chain.ts";

export async function runRegisterInteractiveFlow(
  ctx: VellumCliContext,
  defaults?: { username?: string; displayName?: string },
): Promise<{ username: string; displayName: string; inviteToken?: string }> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createVellumFlowChainView(),
    def: registerFlowDefinition,
    offerId: "register",
    partialSeeds: {
      username: defaults?.username?.trim() || undefined,
      displayName: defaults?.displayName?.trim() || undefined,
    },
  });
  const invite = row.inviteToken?.trim();
  return {
    username: requireFlowString(row, "username"),
    displayName: requireFlowString(row, "displayName"),
    ...(invite !== undefined && invite.length > 0 ? { inviteToken: invite } : {}),
  };
}
