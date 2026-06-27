import type { PersistableRelaySigner } from "@khoralabs/relay-crypto";
import { bytesToHex } from "@khoralabs/relay-crypto";
import { getPublicKeyAsync, signAsync } from "@noble/ed25519";
import { identityPrivFromPersistableAgent } from "./identity-priv";

export type PersistedFrameSigner = {
  readonly did: string;
  readonly actor: string;
  sign(bytes: Uint8Array): Promise<string>;
};

/** Bridge a persisted agent identity to OBP frame signing (hex actor + hex sig). */
export async function createFrameSignerFromPersistableAgent(
  agent: PersistableRelaySigner,
): Promise<PersistedFrameSigner> {
  const rawPriv = identityPrivFromPersistableAgent(agent);
  const rawPub = await getPublicKeyAsync(rawPriv);
  const actor = bytesToHex(new Uint8Array(rawPub));
  return {
    did: agent.did,
    actor,
    async sign(bytes: Uint8Array): Promise<string> {
      const sig = await signAsync(bytes, rawPriv);
      return bytesToHex(sig);
    },
  };
}
