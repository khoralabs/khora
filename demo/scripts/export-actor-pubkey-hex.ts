#!/usr/bin/env bun
/** Print Ed25519 actor pubkey hex (same as {@link FrameSigner.actor}) for the persisted agent key. */
import { defaultIdentityPath, loadIdentity } from "../../apps/atrium/auth/src/index.ts";

import { createFrameSignerFromPersistableAgent } from "../../apps/vellum/client/src/frame-signer.ts";

const path = process.env.ATRIUM_AGENT_KEY_PATH?.trim() ?? defaultIdentityPath();
const signer = await loadIdentity(path);
if (signer === undefined) {
  console.error(`no identity at ${path}`);
  process.exit(1);
}
const frameSigner = await createFrameSignerFromPersistableAgent(signer);
console.log(frameSigner.actor);
