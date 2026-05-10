import type { DidRegistrationRequest } from "./types.ts";

/** App-supplied DID verification (challenge, `did:key` resolution, etc.). */
export interface DidRegistrationVerifier {
  verify(req: DidRegistrationRequest): Promise<void>;
}
