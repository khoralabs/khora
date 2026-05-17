import type { FlagMap } from "@khoralabs/cli-kit";
import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";

import { resolveRoomId, type VellumCliContext } from "./context.ts";
import { connectFlowDefinition } from "./definitions.ts";
import { createVellumFlowChainView } from "./vellum-flow-chain.ts";

/**
 * Resolve room id from flags, positional, env, or readline when missing.
 */
export async function promptRoomIdIfMissing(
  ctx: VellumCliContext,
  flags: FlagMap,
  positionalRoom: string | undefined,
): Promise<string> {
  const pre = resolveRoomId(flags, positionalRoom);
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createVellumFlowChainView(),
    def: connectFlowDefinition,
    offerId: "connect",
    partialSeeds: {
      roomId: pre.length > 0 ? pre : undefined,
    },
  });
  return requireFlowString(
    row,
    "roomId",
    "--room <roomId>, positional <roomId>, or env VELLUM_ROOM_ID is required",
  );
}
