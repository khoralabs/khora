import { zAtriumProfilePatch } from "@khoralabs/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { runProfileUpdateInteractiveFlow } from "../flows/profile-update-flow.ts";
import { strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function profileUseLegacy(flags: FlagMap): boolean {
  return (
    strFlag(flags, "username") !== undefined ||
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
    const username = strFlag(flags, "username");
    const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
    const bio = strFlag(flags, "bio");
    const patch = zAtriumProfilePatch.parse({
      ...(username !== undefined ? { username } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
    });
    if (Object.keys(patch).length === 0) {
      console.error("profile update: pass --username, --display-name, and/or --bio");
      process.exit(1);
    }
    const profile = await client.updateProfile(patch);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  await runProfileUpdateInteractiveFlow(ctx);
}
