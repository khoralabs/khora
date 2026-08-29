import { verifyAsync } from "@noble/ed25519";

import {
  canonicalAgentRequestMessage,
  envelopeSignatureBytes,
} from "../http/signed-request/envelope";
import { publicKeyForDid } from "./pubkey";
import { type AuthStrategy, AuthStrategyError } from "./strategy";

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
