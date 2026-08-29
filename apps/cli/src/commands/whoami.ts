import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";
import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { KhoraClientError } from "@khoralabs/khora-client";
import { agentIdentityPath, cliBaseUrl, loadSigner, withKhoraClient } from "../flows/context";
import { errorMessage } from "../lib/error-message";
import { style } from "../lib/style";

export async function handleWhoami(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const noFetch = boolFlag(flags, "no-fetch");

  let signer: PersistableSigner;
  try {
    signer = await loadSigner(flags);
  } catch (e) {
    const idPath = agentIdentityPath(flags);
    const msg = errorMessage(e);
    console.log(style.error(msg));
    console.log(style.error(`No agent identity at ${idPath}. Run 'khora keygen' first.`));
    process.exit(1);
  }

  if (noFetch) {
    const out = { did: signer.did, source: "identity-only" as const };
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`DID: ${signer.did}`);
      console.log("(profile not fetched — omit --no-fetch to query the host)");
    }
    return;
  }

  const baseUrl = cliBaseUrl(flags);
  try {
    await withKhoraClient(flags, async (client) => {
      const result = await client.lookupProfileByDid(signer.did);
      if (result === null) {
        console.log(style.error("Not registered on this host. Run 'khora register'."));
        process.exit(3);
        return;
      }
      const did = result.did ?? signer.did;
      const { profile } = result;
      if (json) {
        console.log(JSON.stringify({ did, profile }, null, 2));
        return;
      }
      console.log(`DID:       ${did}`);
      console.log(`Username:  ${profile.username}`);
      if (profile.displayName !== undefined && profile.displayName.trim().length > 0) {
        console.log(`Name:      ${profile.displayName}`);
      }
      if (profile.bio !== undefined && profile.bio.trim().length > 0) {
        console.log(`Bio:       ${profile.bio}`);
      }
    });
  } catch (e) {
    if (e instanceof KhoraClientError) {
      console.log(style.error(`Host request failed: ${e.message}`));
      console.log(style.muted(`base-url: ${baseUrl}`));
      console.log(
        style.muted("Use --no-fetch to print your local DID without contacting the host."),
      );
      process.exit(1);
    }
    throw e;
  }
}
