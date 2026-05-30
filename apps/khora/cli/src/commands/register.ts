import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";

import type { KhoraCliContext } from "../flows/context";
import { cliBaseUrl, cliCurrentHostSlug, loadSigner, withKhoraClient } from "../flows/context";
import { runRegisterInteractiveFlow } from "../flows/register-flow";
import { displayNameFromFlags, registerFieldsFromFlags } from "../lib/flags";
import { linkEnsure } from "../registry/client";
import { cliRegistryUrl } from "../registry/config";
import { readLinkState, writeLinkState } from "../registry/link-state";

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

  let registeredDid: string | undefined;
  let registerJson: unknown;
  await withKhoraClient(flags, async (client) => {
    const out = await client.register({
      metadata: {
        username: fields.username,
        displayName: fields.displayName,
        bio: fields.bio,
      },
      ...(fields.inviteToken !== undefined ? { inviteToken: fields.inviteToken } : {}),
    });
    registeredDid = out.did;
    registerJson = out;
    if (!json) {
      console.log(`Registered ${out.profile.username} (${out.did})`);
      console.log(`Profile ID: ${out.profileId}`);
      if (out.profile.displayName !== undefined) {
        console.log(`Name: ${out.profile.displayName}`);
      }
      if (out.profile.bio !== undefined) {
        console.log(`Bio: ${out.profile.bio}`);
      }
    }
  });

  const hostSlug = cliCurrentHostSlug(flags);
  if (hostSlug === undefined || registeredDid === undefined) {
    return;
  }

  try {
    const signer = await loadSigner(flags);
    const registryUrl = cliRegistryUrl(flags);
    const link = await linkEnsure(registryUrl, signer, {
      hostBaseUrl: cliBaseUrl(flags),
      hostSlug,
    });
    if (link === null) {
      return;
    }

    const linkedAtMs = link.linkedAtMs ?? Date.now();
    const state = readLinkState();
    state.currentHost = hostSlug;
    const entry = state.links[hostSlug] ?? { agents: {} };
    entry.agents[registeredDid] = linkedAtMs;
    state.links[hostSlug] = entry;
    writeLinkState(state);

    if (!json) {
      console.log(`Registry link ensured for ${registeredDid} on host ${hostSlug}`);
    }
  } catch (err: unknown) {
    if (!json) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Registry link ensure skipped: ${msg}`);
    }
  }

  if (json && registerJson !== undefined) {
    console.log(JSON.stringify(registerJson, null, 2));
  }
}
