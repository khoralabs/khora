import type { PersistableAgentSigner } from "@khoralabs/atrium-auth";
import { createEd25519FrameSigner, type FrameSigner } from "@khoralabs/obp-v2-frames-impl";
import { getPublicKeyAsync } from "@noble/ed25519";
import { base64pad } from "iso-base/rfc4648";
import { untag } from "iso-base/varint";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";

/** Build an OBP {@link FrameSigner} from the same material as {@link PersistableAgentSigner}. */
export async function createFrameSignerFromPersistableAgent(
  agent: PersistableAgentSigner,
): Promise<FrameSigner> {
  const rawPriv = untag(EdDSASigner.code, base64pad.decode(agent.export()));
  const rawPub = await getPublicKeyAsync(rawPriv);
  const privBytes = new Uint8Array(rawPriv);
  const pubBytes = new Uint8Array(rawPub);
  const privateKey = await crypto.subtle.importKey(
    "raw",
    privBytes.buffer.slice(privBytes.byteOffset, privBytes.byteOffset + privBytes.byteLength),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    pubBytes.buffer.slice(pubBytes.byteOffset, pubBytes.byteOffset + pubBytes.byteLength),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return createEd25519FrameSigner(privateKey, publicKey);
}
