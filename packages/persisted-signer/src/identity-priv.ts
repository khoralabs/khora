import { base64pad } from "iso-base/rfc4648";
import { untag } from "iso-base/varint";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";

import type { PersistableRelaySigner } from "@khoralabs/relay-crypto";

/** Extract raw 32-byte Ed25519 seed from a persisted relay signer. */
export function identityPrivFromPersistableAgent(agent: PersistableRelaySigner): Uint8Array {
  return untag(EdDSASigner.code, base64pad.decode(agent.export()));
}
