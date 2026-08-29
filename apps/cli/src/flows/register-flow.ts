import { requireFlowString, runFlow } from "@khoralabs/cli-kit/flow";

import type { KhoraCliContext } from "./context";
import { registerFlowDefinition } from "./definitions";

export async function runRegisterInteractiveFlow(
  ctx: KhoraCliContext,
  defaults?: { username?: string; displayName?: string; bio?: string },
): Promise<{
  username: string;
  displayName: string;
  bio: string;
  inviteToken?: string;
}> {
  const row = await runFlow({
    readLine: ctx.readLine,
    def: registerFlowDefinition,
    partialSeeds: {
      username: defaults?.username?.trim() || undefined,
      displayName: defaults?.displayName?.trim() || undefined,
      bio: defaults?.bio?.trim() || undefined,
    },
  });
  const invite = row.inviteToken?.trim();
  return {
    username: requireFlowString(row, "username"),
    displayName: requireFlowString(row, "displayName"),
    bio: requireFlowString(row, "bio"),
    ...(invite !== undefined && invite.length > 0 ? { inviteToken: invite } : {}),
  };
}
