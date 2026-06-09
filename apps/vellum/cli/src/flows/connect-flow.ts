import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { FlagMap } from "@khoralabs/cli-kit";

import { resolveChannelId, type VellumCliContext } from "./context";
import { connectFlowDefinition } from "./definitions";
import { createVellumFlowChainView } from "./vellum-flow-chain";

/**
 * Resolve channel id from flags, positional, env, or readline when missing.
 */
export async function promptChannelIdIfMissing(
  ctx: VellumCliContext,
  flags: FlagMap,
  positionalChannel: string | undefined,
): Promise<string> {
  const pre = resolveChannelId(flags, positionalChannel);
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createVellumFlowChainView(),
    def: connectFlowDefinition,
    offerId: "connect",
    partialSeeds: {
      channelId: pre.length > 0 ? pre : undefined,
    },
  });
  return requireFlowString(
    row,
    "channelId",
    "--channel <channelId>, positional <channelId>, or env VELLUM_CHANNEL_ID is required",
  );
}
