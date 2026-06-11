import type { PersistableRelaySigner } from "@khoralabs/agent-persisted-signer";

/** Minimal signer stub for control-server unit tests. */
export function testControlSigner(did = "did:key:alice"): PersistableRelaySigner {
  return {
    did,
    export: () => "dGVzdA==",
    sign: async () => new Uint8Array(64),
  };
}
