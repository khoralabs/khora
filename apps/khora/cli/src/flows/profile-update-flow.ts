import { runOfferFlow } from "@khoralabs/cli-flow-nbc";

import type { KhoraCliContext } from "./context";
import { profileUpdateFlowDefinition } from "./definitions";
import { createKhoraFlowChainView } from "./khora-flow-chain";

export async function runProfileUpdateInteractiveFlow(
  ctx: KhoraCliContext,
): Promise<{ displayName?: string; bio?: string }> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: profileUpdateFlowDefinition,
    offerId: "update",
  });
  const displayName = row.displayName?.trim();
  const bio = row.bio?.trim();
  if (
    (displayName === undefined || displayName.length === 0) &&
    (bio === undefined || bio.length === 0)
  ) {
    throw new Error("At least one of name or bio is required.");
  }
  return {
    ...(displayName !== undefined && displayName.length > 0 ? { displayName } : {}),
    ...(bio !== undefined && bio.length > 0 ? { bio } : {}),
  };
}
