import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";

import type { KhoraCliContext } from "../flows/context";
import { withKhoraClient } from "../flows/context";
import { runProfileUpdateInteractiveFlow } from "../flows/profile-update-flow";
import { profilePatchFromFlags } from "../lib/flags";

export async function handleProfileUpdate(ctx: KhoraCliContext, flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  let patch = profilePatchFromFlags(flags);

  if (patch === null) {
    const partial =
      flags.name !== undefined ||
      flags["display-name"] !== undefined ||
      flags.displayName !== undefined ||
      flags.bio !== undefined;
    if (partial) {
      throw new Error(
        "Profile update requires at least one of --name (or --display-name) or --bio.",
      );
    }
    patch = await runProfileUpdateInteractiveFlow(ctx);
  }

  await withKhoraClient(flags, async (client) => {
    const profile = await client.updateProfile(patch);
    if (json) {
      console.log(JSON.stringify(profile, null, 2));
      return;
    }
    console.log(`Updated profile ${profile.username}`);
    if (profile.displayName !== undefined) {
      console.log(`Name: ${profile.displayName}`);
    }
    if (profile.bio !== undefined) {
      console.log(`Bio: ${profile.bio}`);
    }
  });
}
