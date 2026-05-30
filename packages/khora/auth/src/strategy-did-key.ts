import { verifyAsync } from "@noble/ed25519";
import { DIDKey } from "iso-did/key";
import { type AuthStrategy, AuthStrategyError } from "./strategy";
import { canonicalAgentRequestMessage, envelopeSignatureBytes } from "./wire";

function publicKeyForDid(did: string): Uint8Array {
  let parsed: DIDKey;
  try {
    parsed = DIDKey.fromString(did);
  } catch {
    throw new AuthStrategyError(`unknown did:key: ${did}`);
  }
  if (parsed.type !== "Ed25519") {
    throw new AuthStrategyError(`unsupported did:key type: ${parsed.type}`);
  }
  return parsed.publicKey;
}

/** Verify per-request Ed25519 signatures issued by `did:key` agents. */
export function createDidKeyEd25519Strategy(): AuthStrategy {
  return {
    async verifyEnvelope(p) {
      const pubKey = publicKeyForDid(p.envelope.did);
      const message = await canonicalAgentRequestMessage({
        method: p.method,
        path: p.path,
        timestampMs: p.envelope.timestampMs,
        nonce: p.envelope.nonce,
        bodyText: p.bodyText,
      });
      const ok = await verifyAsync(envelopeSignatureBytes(p.envelope), message, pubKey);
      if (!ok) {
        throw new AuthStrategyError("agent request signature invalid");
      }
    },
  };
}
