import { runFlow } from "@khoralabs/cli-kit/flow";

import type { KhoraCliContext } from "./context";
import { profileUpdateFlowDefinition } from "./definitions";

export async function runProfileUpdateInteractiveFlow(
  ctx: KhoraCliContext,
): Promise<{ displayName?: string; bio?: string }> {
  const row = await runFlow({
    readLine: ctx.readLine,
    def: profileUpdateFlowDefinition,
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
