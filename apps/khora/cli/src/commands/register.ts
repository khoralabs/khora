import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";

import type { KhoraCliContext } from "../flows/context.ts";
import { withKhoraClient } from "../flows/context.ts";
import { runRegisterInteractiveFlow } from "../flows/register-flow.ts";
import { displayNameFromFlags, registerFieldsFromFlags } from "../lib/flags.ts";

export async function handleRegister(ctx: KhoraCliContext, flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  let fields = registerFieldsFromFlags(flags);

  const hasUsernameFlag = flags.username !== undefined;
  const hasNameFlag =
    flags.name !== undefined ||
    flags["display-name"] !== undefined ||
    flags.displayName !== undefined;
  const hasBioFlag = flags.bio !== undefined;
  const partialFlags = hasUsernameFlag || hasNameFlag || hasBioFlag;

  if (fields === null) {
    if (partialFlags) {
      throw new Error(
        "Non-interactive register requires --username, --name (or --display-name), and --bio.",
      );
    }
    const usernameDefault = strFlag(flags, "username")?.trim();
    const nameDefault = displayNameFromFlags(flags);
    const bioDefault = strFlag(flags, "bio")?.trim();
    const prompted = await runRegisterInteractiveFlow(ctx, {
      ...(usernameDefault !== undefined && usernameDefault.length > 0
        ? { username: usernameDefault }
        : {}),
      ...(nameDefault !== undefined ? { displayName: nameDefault } : {}),
      ...(bioDefault !== undefined && bioDefault.length > 0 ? { bio: bioDefault } : {}),
    });
    fields = prompted;
  }

  await withKhoraClient(flags, async (client) => {
    const out = await client.register({
      metadata: {
        username: fields.username,
        displayName: fields.displayName,
        bio: fields.bio,
      },
      ...(fields.inviteToken !== undefined ? { inviteToken: fields.inviteToken } : {}),
    });
    if (json) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(`Registered ${out.profile.username} (${out.did})`);
    console.log(`Profile ID: ${out.profileId}`);
    if (out.profile.displayName !== undefined) {
      console.log(`Name: ${out.profile.displayName}`);
    }
    if (out.profile.bio !== undefined) {
      console.log(`Bio: ${out.profile.bio}`);
    }
  });
}
