import { LRUCache } from "lru-cache";
import { base58Decode } from "./encoding";

const pubKeyCache = new LRUCache<string, Uint8Array>({ max: 512 });

/** Extract raw 32-byte Ed25519 public key from a `did:key:` string. */
export function ed25519PublicKeyBytesFromDid(did: string): Uint8Array {
  const cached = pubKeyCache.get(did);
  if (cached !== undefined) return cached;
  const didKeyPrefix = "did:key:";
  if (!did.startsWith(didKeyPrefix)) {
    throw new Error(`unsupported DID: ${did}`);
  }
  const multibase = did.slice(didKeyPrefix.length);
  if (!multibase.startsWith("z")) {
    throw new Error(`unsupported DID multibase: ${did}`);
  }
  const decoded = base58Decode(multibase.slice(1));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`unsupported did:key multicodec: ${did}`);
  }
  const pubKey = decoded.slice(2);
  pubKeyCache.set(did, pubKey);
  return pubKey;
}
