import { ed25519PublicKeyBytesFromDid } from "@khoralabs/did-key-identity";

import { AuthStrategyError } from "./strategy";

/** Resolve a `did:key` Ed25519 public key for signature verification. */
export function publicKeyForDid(did: string): Uint8Array {
  try {
    return ed25519PublicKeyBytesFromDid(did);
  } catch (e) {
    throw new AuthStrategyError(e instanceof Error ? e.message : String(e));
  }
}
