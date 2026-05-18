import {
  generateAgentIdentity,
  loadIdentity,
  saveIdentity,
} from "@khoralabs/agent-persisted-signer";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";

import { agentIdentityPath } from "../flows/context.ts";

export async function handleKeygen(flags: FlagMap): Promise<void> {
  const force = boolFlag(flags, "force", "f");
  const json = boolFlag(flags, "json");
  const keyPath = agentIdentityPath(flags);

  if (!force) {
    const existing = await loadIdentity(keyPath);
    if (existing !== undefined) {
      console.error(`Identity already exists at ${keyPath}. Use --force to overwrite.`);
      process.exit(1);
    }
  }

  const signer = await generateAgentIdentity();
  await saveIdentity(keyPath, signer);

  if (json) {
    console.log(JSON.stringify({ did: signer.did, path: keyPath }));
  } else {
    console.log(`DID:  ${signer.did}`);
    console.log(`Saved ${keyPath}`);
  }
}
