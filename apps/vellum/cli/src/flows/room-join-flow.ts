import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import type { VellumCliContext } from "./context.ts";
import { roomJoinFlowDefinition } from "./definitions.ts";
import { createVellumFlowChainView } from "./vellum-flow-chain.ts";

/**
 * Resolve join token from flags or readline when absent / empty.
 */
export async function promptJoinTokenIfMissing(
  ctx: VellumCliContext,
  flags: FlagMap,
): Promise<string> {
  const fromFlag = strFlag(flags, "join-token") ?? strFlag(flags, "joinToken");
  const seed = fromFlag !== undefined && fromFlag.trim().length > 0 ? fromFlag.trim() : undefined;
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createVellumFlowChainView(),
    def: roomJoinFlowDefinition,
    offerId: "join",
    partialSeeds: {
      joinToken: seed,
    },
  });
  return requireFlowString(row, "joinToken", "room join requires --join-token=<token>");
}
