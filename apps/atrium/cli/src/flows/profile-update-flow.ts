import { zAtriumProfilePatch } from "@khoralabs/atrium-contracts";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import type { AtriumCliContext } from "./context.ts";
import {
  PROFILE_UPDATE_ROOT,
  profileUpdateLinearTransitions,
} from "./graphs/profile-update-linear.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runProfileUpdateInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = createInMemoryObpPersistenceClient();
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: PROFILE_UPDATE_ROOT,
    transitions: profileUpdateLinearTransitions,
    readLine: ctx.readLine,
  });

  const row = result.bindsByStep.profile;
  if (row === undefined) {
    throw new Error("profile: missing bind payload");
  }

  const patch = zAtriumProfilePatch.parse({
    ...(row.username !== undefined && String(row.username).trim().length > 0
      ? { username: String(row.username).trim() }
      : {}),
    ...(row["display-name"] !== undefined && String(row["display-name"]).trim().length > 0
      ? { displayName: String(row["display-name"]).trim() }
      : {}),
    ...(row.bio !== undefined && String(row.bio).trim().length > 0
      ? { bio: String(row.bio).trim() }
      : {}),
  });

  if (Object.keys(patch).length === 0) {
    throw new Error("Provide at least one of username, display name, or bio.");
  }

  const profile = await ctx.client.updateProfile(patch);
  console.log(JSON.stringify(profile, null, 2));
}
