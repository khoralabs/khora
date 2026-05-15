import type { PersistableAgentSigner } from "@khoralabs/atrium-auth";
import type { FrameSigner } from "@khoralabs/obp-v2-frames-impl";
import { getPublicKeyAsync, signAsync } from "@noble/ed25519";
import { base64pad } from "iso-base/rfc4648";
import { untag } from "iso-base/varint";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createFrameSignerFromPersistableAgent(
  agent: PersistableAgentSigner,
): Promise<FrameSigner> {
  const rawPriv = untag(EdDSASigner.code, base64pad.decode(agent.export()));
  const rawPub = await getPublicKeyAsync(rawPriv);
  const actor = bytesToHex(new Uint8Array(rawPub));
  return {
    actor,
    async sign(bytes: Uint8Array): Promise<string> {
      const sig = await signAsync(bytes, rawPriv);
      return bytesToHex(sig);
    },
  };
}
