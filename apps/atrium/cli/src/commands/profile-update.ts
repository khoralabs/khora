import { zAtriumProfilePatch } from "@cfd/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { runProfileUpdateInteractiveFlow } from "../flows/profile-update-flow.ts";
import { requireAgentDid } from "../flows/require-agent-did.ts";
import { strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function profileUseLegacy(flags: FlagMap): boolean {
  return (
    strFlag(flags, "display-name") !== undefined ||
    strFlag(flags, "displayName") !== undefined ||
    strFlag(flags, "bio") !== undefined
  );
}

export async function runProfileUpdateCommand(
  ctx: AtriumCliContext,
  flags: FlagMap,
): Promise<void> {
  const { client } = ctx;
  if (profileUseLegacy(flags)) {
    const did = requireAgentDid();
    const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
    const bio = strFlag(flags, "bio");
    const patch = zAtriumProfilePatch.parse({
      ...(displayName !== undefined ? { displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
    });
    if (Object.keys(patch).length === 0) {
      console.error("profile update: pass --display-name and/or --bio");
      process.exit(1);
    }
    const profile = await client.updateProfile(did, patch);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  await runProfileUpdateInteractiveFlow(ctx);
}
