import type { PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, style } from "@khoralabs/cli-kit";
import { KhoraClient, KhoraClientError } from "@khoralabs/khora-client";

import { agentIdentityPath, cliBaseUrl, loadSigner } from "../flows/context.ts";

export async function handleWhoami(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const noFetch = boolFlag(flags, "no-fetch") || boolFlag(flags, "noFetch");

  let signer: PersistableAgentSigner;
  try {
    signer = await loadSigner(flags);
  } catch (e) {
    const idPath = agentIdentityPath(flags);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(style.error(msg));
    console.error(style.error(`No agent identity at ${idPath}. Generate or import a key first.`));
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
  const ac = new KhoraClient({ baseUrl, signer });
  try {
    const result = await ac.lookupProfileByDid(signer.did);
    if (result === null) {
      console.error(style.error("Not registered on this host. Run 'vellum register'."));
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
      console.log(`Display:   ${profile.displayName}`);
    }
    if (profile.bio !== undefined && profile.bio.trim().length > 0) {
      console.log(`Bio:       ${profile.bio}`);
    }
  } catch (e) {
    if (e instanceof KhoraClientError) {
      console.error(style.error(`Host request failed: ${e.message}`));
      console.error(style.muted(`base-url: ${baseUrl}`));
      console.error(
        style.muted("Use --no-fetch to print your local DID without contacting the host."),
      );
      process.exit(1);
    }
    throw e;
  } finally {
    ac.dispose();
  }
}
