import type { DidVerifier } from "@cfd/swarm-host";

/** Permissive verifier for local development and tests; replace in production. */
export function createDevDidVerifier(): DidVerifier {
  return {
    async verifyRegistration() {},
    async verifyAuthenticatedAgent() {},
    async verifyInboxAccess() {},
  };
}
